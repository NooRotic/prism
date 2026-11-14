<?php

// Copy this file to /prism-data/config.php on the host and fill it in. The real file is created by the owner,
// lives outside public/, and is never committed, read by tooling, uploaded by the deploy, or pasted into chat.

return [
    'db' => [
        'host' => 'localhost',
        'name' => '',
        'user' => '',
        'pass' => '',
    ],
    'twitch' => [
        'client_id' => '',
        'client_secret' => '',
    ],
    // Only these origins may call the API from a browser.
    'allowed_origins' => ['https://prism.nooroticx.tv', 'http://localhost:5000'],
    'tt' => [
        'enabled' => true,
        // Names PRISM and a public contact address, as TwitchTracker's API guidance asks. The server refuses to start
        // while this still contains the example.com placeholder.
        'user_agent' => 'PRISM/1.0 (+https://prism.nooroticx.tv; contact: you@example.com)',
        'gap_ms' => 1500,
        'run_budget' => 300,
        'day_budget' => 1500,
    ],
    'tracking' => [
        'tail_days' => 30,
        'new_per_hour' => 20,
        'new_per_day' => 200,
        'untracked_recheck_days' => 7,
        // Twitch lookups per hour for logins never seen before (a flood of made-up names stops here).
        'lookups_per_hour' => 100,
    ],
    // The owner-only admin side (the /admin page of PRISM). It stays off until both ids are filled in. Neither value is
    // a secret: owner_twitch_id is your numeric Twitch user id (php8.4-cli bin/twitch-id.php <login> prints it) and
    // frontend_client_id is the client id PRISM's own pages sign in with (VITE_TWITCH_CLIENT_ID). A wrong value
    // switches the admin side off; it never breaks the public API.
    'admin' => [
        'enabled' => true,
        'owner_twitch_id' => '',
        'frontend_client_id' => '',
    ],
    // Kill switches: set to false to switch behaviour off without a redeploy.
    'flags' => [
        'visits_enabled' => true,
        'new_channels_enabled' => true,
    ],
    // Counts and statuses only, never secrets. Keep it outside public/.
    'log_path' => __DIR__ . '/history.log',
];
