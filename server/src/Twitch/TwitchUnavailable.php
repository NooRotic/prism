<?php

declare(strict_types=1);

namespace Prism\History\Twitch;

use RuntimeException;

/** Twitch could not answer: a network failure, a non-200 status, an unreadable body, or a rejected token. Messages carry status codes only. */
final class TwitchUnavailable extends RuntimeException
{
}
