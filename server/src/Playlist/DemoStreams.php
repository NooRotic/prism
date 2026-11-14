<?php

declare(strict_types=1);

namespace Prism\History\Playlist;

/**
 * PRISM's own public test streams (the HLS and DASH entries of src/config/demoContent.ts). They are stored pinned and
 * "working" from day one, because they are known to play, and Big Buck Bunny is the page's default until the owner picks another.
 */
final class DemoStreams
{
    /** The demo id of the stream the HLS page opens on. */
    public const DEFAULT_ID = 'bbb-hls';

    /** @var list<array{id:string,name:string,url:string,kind:string}> */
    public const ALL = [
        ['id' => 'apple-basic', 'name' => 'Apple HLS Basic', 'url' => 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8', 'kind' => 'hls'],
        ['id' => 'apple-4k', 'name' => 'Apple 4K HEVC', 'url' => 'https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8', 'kind' => 'hls'],
        ['id' => 'bbb-hls', 'name' => 'Big Buck Bunny', 'url' => 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'kind' => 'hls'],
        ['id' => 'dash-bbb', 'name' => 'Big Buck Bunny DASH', 'url' => 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', 'kind' => 'dash'],
        ['id' => 'dash-envivio', 'name' => 'Envivio DASH', 'url' => 'https://dash.akamaized.net/envivio/EnvisioTVDVBTest/manifest.mpd', 'kind' => 'dash'],
    ];
}
