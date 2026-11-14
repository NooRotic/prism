<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Twitch\TokenValidator;
use Prism\History\Twitch\TwitchUnavailable;
use Prism\History\Tests\Support\World;

final class TokenValidatorTest extends TestCase
{
    private const TOKEN = 'abcdefghij0123456789abcdefghij';

    private World $world;
    private TokenValidator $validator;

    protected function setUp(): void
    {
        $this->world = new World();
        $this->validator = new TokenValidator($this->world->http);
    }

    public function testReadsTheFieldsFromTwitchsAnswer(): void
    {
        $this->world->grantToken(self::TOKEN, '1000', 'OwnerName', 'front', ['bits:read'], 12345);

        $info = $this->validator->validate(self::TOKEN);

        $this->assertNotNull($info);
        $this->assertSame('front', $info->clientId);
        $this->assertSame('1000', $info->userId);
        $this->assertSame('OwnerName', $info->login);
        $this->assertSame(['bits:read'], $info->scopes);
        $this->assertSame(12345, $info->expiresInSec);
        $this->assertSame('OAuth ' . self::TOKEN, $this->world->http->requests[0]['headers']['Authorization']);
    }

    public function testMissingOrNullScopesMeanNoScopes(): void
    {
        $this->world->tokens[self::TOKEN] = ['client_id' => 'front', 'login' => 'o', 'user_id' => '1000', 'scopes' => null, 'expires_in' => 60];
        $this->assertSame([], $this->validator->validate(self::TOKEN)->scopes);

        $this->world->tokens[self::TOKEN] = ['client_id' => 'front', 'login' => 'o', 'user_id' => '1000', 'expires_in' => 60];
        $this->assertSame([], $this->validator->validate(self::TOKEN)->scopes);
    }

    public function testA401IsNull(): void
    {
        $this->assertNull($this->validator->validate(self::TOKEN));
    }

    public function testAnAppTokenWithoutAUserIsNull(): void
    {
        $this->world->grantToken(self::TOKEN, null, '', 'front');

        $this->assertNull($this->validator->validate(self::TOKEN));
    }

    public function testOtherStatusesAndGarbageThrowTwitchUnavailableWithoutTheBodyOrToken(): void
    {
        $this->world->validateStatus = 503;
        try {
            $this->validator->validate(self::TOKEN);
            $this->fail('a 503 must throw');
        } catch (TwitchUnavailable $e) {
            $this->assertStringContainsString('503', $e->getMessage());
            $this->assertStringNotContainsString(self::TOKEN, $e->getMessage());
        }

        $this->world->validateStatus = 200;
        foreach (['not json', '[]', '{"client_id":5}', ''] as $garbage) {
            $this->world->validateRawBody = $garbage;
            try {
                $this->validator->validate(self::TOKEN);
                $this->fail('an unreadable answer must throw: ' . $garbage);
            } catch (TwitchUnavailable $e) {
                $this->assertStringNotContainsString(self::TOKEN, $e->getMessage());
            }
        }
    }
}
