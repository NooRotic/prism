<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\Net\IpGuard;

final class IpGuardTest extends TestCase
{
    public function testAddressTable(): void
    {
        $public = [
            '8.8.8.8', '1.1.1.1', '93.184.216.34', '2001:4860:4860::8888', '2606:4700:4700::1111',
            // Just outside each blocked range.
            '11.0.0.1', '126.255.255.255', '128.0.0.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.1.1', '192.167.1.1', '198.17.255.255', '198.20.0.1',
        ];
        foreach ($public as $ip) {
            $this->assertTrue(IpGuard::isPublic($ip), $ip . ' is a public address');
        }

        $blocked = [
            // IPv4: loopback, private, link-local (the cloud metadata address), shared (CGNAT), unspecified, multicast, reserved, documentation, benchmarking.
            '127.0.0.1', '127.255.255.255', '10.0.0.1', '10.255.255.255', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255',
            '0.0.0.0', '0.1.2.3', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
            '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.1', '203.0.113.1', '192.88.99.1',
            // IPv6: loopback, unspecified, link-local, unique-local, multicast, site-local, discard.
            '::1', '::', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', 'fec0::1', '100::1',
            // IPv6 that carries an IPv4 address inside: mapped, compatible, NAT64, 6to4, Teredo.
            '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:8.8.8.8', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b::808:808', '2002:7f00:1::1', '2002:808:808::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2',
            // IPv6 documentation.
            '2001:db8::1',
        ];
        foreach ($blocked as $ip) {
            $this->assertFalse(IpGuard::isPublic($ip), $ip . ' must be blocked');
        }

        $garbage = [
            '', 'localhost', 'example.com', '1.2.3', '1.2.3.4.5', '256.1.1.1', '127.1', '0x7f.0.0.1', '2130706433', '010.0.0.1',
            ' 8.8.8.8', '8.8.8.8 ', "8.8.8.8\n", '[::1]', '::1%eth0', '8.8.8.8/32', 'not an address', "8.8.8.8\0",
        ];
        foreach ($garbage as $text) {
            $this->assertFalse(IpGuard::isPublic($text), json_encode($text) . ' is not an address, so it is not public');
        }
    }
}
