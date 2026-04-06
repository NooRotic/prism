# Twitch - GLAZE ME / GALZER

# High level Idea - Twitch Channel Streamer Highlighter
A hls/dash/twitch/youtube player main focus on 
Twitch web player that loads twitch user auth and displays their user profile in a fresh way
- supports youtube links
- supports hls/dash playlisting 
    - supports auth
    - will need twitch oauth login - use wsp-skills-portfolio account creds - see below

* SMART url input- saves previous searches
    - when focus given, show row of top in category, like quick link to top links
    - cache thumbnails to show super detail rows: thumbnail, url, desc, time etc instead of just text  
    - change color depending on source - red/youtube, purple/twitch, dar 

* MVP HLS/DASH/Twitch with frontend UI operational
* future builds to include youtube
* If target twitch user is a live streamer, streamer display format is shown
* If target twitch user is not a live streamer, show as much information about followers and interests
* Video player front and center playing either
    - if streamer : last created clip
    - if not streamer: video playing of either last made clip or favorite streamer
* Easy left and right columns to see vods/clips/etc

# Review Attempts
* There is a twitch-glazer project within the wsp-skills-portoflio
* we began work on a separate /twitch-glazer and /twitch-media-demo
    - we reached basic video playback
    - was confined to framework along with wsp portfolio project
* only review previous code and work to gather insights and understanding
* ask questions to clarify any doubts
* Borrow color theme and styling

# Goals - Twitch Glaze Me
* Independent repo stand alone
* we can choose new tech stack better fitting to goals
* static web hosting to deploy to
* CI/CD github setup
* Twitch Auth token configuration setup - user needs twitch login
* Overall goal : Highlight in a bold-in-your-face way to present a twitch chatter and empathize twitch streamers with dash/hls playlist bonus feature
* Video player in center updates content when user selects thumbnails - SPA style
* Video player must take twitch VOD quirks, twitch clips and stories/etc
    - must support possibly player swapping for twitch VODs - embed/url parsing, it's not straightforward
