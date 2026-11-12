<?php

declare(strict_types=1);

namespace Prism\History\Tests;

use PHPUnit\Framework\TestCase;
use Prism\History\BioLinks;

final class BioLinksTest extends TestCase
{
    /** @return list<string> just the URLs, in order */
    private function urls(string $bio): array
    {
        return array_column(BioLinks::extract($bio), 'url');
    }

    public function testFindsYoutubeHandleChannelCAndUserUrls(): void
    {
        $bio = "Watch https://www.youtube.com/@alice or youtube.com/channel/UCabc123_-x\n"
            . "also https://youtube.com/c/AliceTV and www.youtube.com/user/alice99";

        $this->assertSame(
            [
                'https://www.youtube.com/@alice',
                'https://www.youtube.com/channel/UCabc123_-x',
                'https://www.youtube.com/c/AliceTV',
                'https://www.youtube.com/user/alice99',
            ],
            $this->urls($bio),
        );
        $this->assertSame('youtube', BioLinks::extract($bio)[0]['platform']);
    }

    public function testFindsKickChannel(): void
    {
        $links = BioLinks::extract('Live on https://kick.com/alice_live and KICK.com/Bob');

        $this->assertSame(
            [
                ['platform' => 'kick', 'url' => 'https://kick.com/alice_live'],
                ['platform' => 'kick', 'url' => 'https://kick.com/Bob'],
            ],
            $links,
        );
    }

    public function testAddsHttpsAndStripsTrailingPunctuation(): void
    {
        $this->assertSame(
            ['https://www.youtube.com/@x', 'https://kick.com/y', 'https://kick.com/z'],
            $this->urls('Find me: (youtube.com/@x), and kick.com/y. Also http://kick.com/z!'),
        );
    }

    public function testIsCaseInsensitiveOnTheHostAndKeepsThePathCase(): void
    {
        $this->assertSame(['https://www.youtube.com/@Alice'], $this->urls('HTTPS://WWW.YOUTUBE.COM/@Alice'));
    }

    public function testKeepsOnlyTheChannelPartOfALongerPath(): void
    {
        $this->assertSame(
            ['https://www.youtube.com/@alice', 'https://kick.com/bob'],
            $this->urls('youtube.com/@alice/videos and kick.com/bob/clips'),
        );
    }

    public function testIgnoresLookalikesAndVideoLinks(): void
    {
        $bio = implode("\n", [
            'notyoutube.com/@x',
            'kick.com.evil.io/x',
            'youtube.com.evil.io/@x',
            'kick.com-evil.io/x',
            'youtube.com/watch?v=abc',
            'youtu.be/abc',
            'evil.com/youtube.com/@x',
            'mail me@kick.com',
            'https://kick.com/video/abc123',
            'https://kick.com/categories',
        ]);

        $this->assertSame([], $this->urls($bio));
    }

    public function testDeduplicatesAcrossSchemeWwwAndCase(): void
    {
        $this->assertSame(
            ['https://www.youtube.com/@alice'],
            $this->urls('youtube.com/@alice https://www.youtube.com/@alice HTTP://YOUTUBE.COM/@ALICE'),
        );
    }

    public function testCapsAtFivePerPlatform(): void
    {
        $kick = implode(' ', array_map(static fn (int $i): string => "kick.com/chan{$i}", range(1, 7)));
        $youtube = implode(' ', array_map(static fn (int $i): string => "youtube.com/@yt{$i}", range(1, 6)));

        $links = BioLinks::extract($kick . ' ' . $youtube);

        $this->assertCount(10, $links);
        $this->assertSame(
            ['https://kick.com/chan1', 'https://kick.com/chan2', 'https://kick.com/chan3', 'https://kick.com/chan4', 'https://kick.com/chan5'],
            array_column(array_filter($links, static fn (array $l): bool => $l['platform'] === 'kick'), 'url'),
        );
    }

    public function testSkipsAUrlThatWouldNotFitTheColumn(): void
    {
        $this->assertSame([], $this->urls('kick.com/' . str_repeat('a', 300)));
    }

    public function testEmptyAndNoLinks(): void
    {
        $this->assertSame([], BioLinks::extract(''));
        $this->assertSame([], BioLinks::extract('Just a streamer who likes games. twitter.com/alice'));
    }
}
