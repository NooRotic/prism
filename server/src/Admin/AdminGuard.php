<?php

declare(strict_types=1);

namespace Prism\History\Admin;

use Prism\History\Api\Request;
use Prism\History\Clock;
use Prism\History\Config;
use Prism\History\RateCap;
use Prism\History\Store\AttemptStore;
use Prism\History\Store\UsageCounters;
use Prism\History\Twitch\TokenValidator;
use Prism\History\Twitch\TwitchUnavailable;

/**
 * Decides whether an admin request comes from the owner. The Bearer token is checked with Twitch (cached for a
 * while for the owner), and accepted only when ALL of these hold: the user is the configured owner, the token was
 * issued to PRISM's own front-end app, and it carries no permissions (so the owner's long-lived viewer token,
 * even stolen, cannot administer anything). Everyone else is refused, and the people the owner asked to be told
 * about (a valid Twitch user who is not the owner) are written to the attempts table by name. The name always
 * comes from Twitch's answer, never from the request.
 */
final class AdminGuard
{
    /** A real Twitch token is 30 characters; this is looser so a Twitch change cannot lock the owner out. */
    private const TOKEN_SHAPE = '/^[A-Za-z0-9]{20,64}$/';
    private const CACHE_MAX_SECONDS = 1800;
    private const VALIDATIONS_PER_MINUTE = 30;
    private const SIGNED_OUT_PER_MINUTE = 600;

    public function __construct(
        private Config $config,
        private TokenValidator $validator,
        private TokenCache $cache,
        private AttemptStore $attempts,
        private UsageCounters $counters,
        private RateCap $cap,
        private Clock $clock,
    ) {
    }

    public function authorize(Request $request): AdminDecision
    {
        if (!$this->config->adminActive()) {
            return AdminDecision::of(AdminDecision::NOT_FOUND);
        }

        $token = $request->bearerToken();
        if ($token === null || preg_match(self::TOKEN_SHAPE, $token) !== 1) {
            return $this->signedOut();
        }
        if ($this->cache->isOwner($token)) {
            return AdminDecision::of(AdminDecision::OWNER);
        }
        // Only a token Twitch has not been asked about lands here, so a flood of made-up tokens cannot turn into a flood of Twitch calls.
        if (!$this->cap->allow('admin-validate', self::VALIDATIONS_PER_MINUTE)) {
            return AdminDecision::of(AdminDecision::BUSY);
        }

        try {
            $info = $this->validator->validate($token);
        } catch (TwitchUnavailable) {
            return AdminDecision::of(AdminDecision::UNAVAILABLE); // an outage must not log or lock out anyone
        }
        if ($info === null) {
            return $this->signedOut();
        }

        $isOwner = hash_equals((string) $this->config->adminOwnerTwitchId(), $info->userId);
        $rightKind = $info->clientId === $this->config->adminFrontendClientId() && $info->scopes === [];
        if ($isOwner && $rightKind) {
            $this->cache->remember($token, min($info->expiresInSec, self::CACHE_MAX_SECONDS));

            return AdminDecision::of(AdminDecision::OWNER);
        }
        if ($isOwner) {
            return AdminDecision::of(AdminDecision::REFUSED); // the owner's own wrong kind of token: refused, not logged
        }

        $this->attempts->record($info->userId, $info->login, !$rightKind);

        return AdminDecision::of(AdminDecision::REFUSED, true);
    }

    /** No usable token: counted in today's anonymous total, under a global cap, never named. */
    private function signedOut(): AdminDecision
    {
        if ($this->cap->allow('signed-out', self::SIGNED_OUT_PER_MINUTE)) {
            $this->counters->increment('signed_out');
        }

        return AdminDecision::of(AdminDecision::SIGNED_OUT);
    }
}
