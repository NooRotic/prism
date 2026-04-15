export interface TwitchUser {
  id: string
  login: string
  display_name: string
  type: string
  broadcaster_type: 'partner' | 'affiliate' | ''
  description: string
  profile_image_url: string
  offline_image_url: string
  view_count: number
  created_at: string
}

export interface TwitchChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  broadcaster_language: string
  game_id: string
  game_name: string
  title: string
  delay: number
  tags: string[]
  content_classification_labels: string[]
  is_branded_content: boolean
}

export interface TwitchStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_id: string
  game_name: string
  type: 'live' | ''
  title: string
  viewer_count: number
  started_at: string
  language: string
  thumbnail_url: string
  is_mature: boolean
  tags: string[]
}

export interface TwitchClip {
  id: string
  url: string
  embed_url: string
  broadcaster_id: string
  broadcaster_name: string
  creator_id: string
  creator_name: string
  video_id: string
  game_id: string
  language: string
  title: string
  view_count: number
  created_at: string
  thumbnail_url: string
  duration: number
  vod_offset: number | null
}

export interface TwitchVideo {
  id: string
  stream_id: string
  user_id: string
  user_login: string
  user_name: string
  title: string
  description: string
  created_at: string
  published_at: string
  url: string
  thumbnail_url: string
  viewable: string
  view_count: number
  language: string
  type: 'upload' | 'archive' | 'highlight'
  duration: string
}

export interface TwitchGame {
  id: string
  name: string
  box_art_url: string
  igdb_id: string
}

export interface TwitchEmote {
  id: string
  name: string
  images: {
    url_1x: string
    url_2x: string
    url_4x: string
  }
  tier?: string
  emote_type: string
  emote_set_id: string
  format: string[]
  scale: string[]
  theme_mode: string[]
}

export interface TwitchBadge {
  set_id: string
  versions: {
    id: string
    image_url_1x: string
    image_url_2x: string
    image_url_4x: string
    title: string
    description: string
  }[]
}

export interface TwitchFollowedChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
}

// ─── Streamer stats (phase 2.3) ──────────────────────────────────────

export type TwitchSubscriptionTier = '1000' | '2000' | '3000'

export interface TwitchBroadcasterSubscription {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  gifter_id: string
  gifter_login: string
  gifter_name: string
  is_gift: boolean
  tier: TwitchSubscriptionTier
  plan_name: string
  user_id: string
  user_name: string
  user_login: string
}

export interface TwitchBroadcasterSubscriptionsResponse {
  data: TwitchBroadcasterSubscription[]
  total: number
  /** Sum of tier-weighted sub points Twitch uses for emote slot rewards. */
  points: number
  pagination?: { cursor?: string }
}

export type TwitchGoalType =
  | 'follower'
  | 'subscription'
  | 'subscription_count'
  | 'new_subscription'
  | 'new_subscription_count'

export interface TwitchGoal {
  id: string
  broadcaster_id: string
  broadcaster_name: string
  broadcaster_login: string
  type: TwitchGoalType
  description: string
  current_amount: number
  target_amount: number
  created_at: string
}

export interface TwitchVIP {
  user_id: string
  user_login: string
  user_name: string
}

export interface TwitchHypeTrainContribution {
  total: number
  type: 'BITS' | 'SUBS' | 'OTHER'
  user: string
}

export interface TwitchHypeTrainEventData {
  id: string
  broadcaster_id: string
  cooldown_end_time: string
  expires_at: string
  goal: number
  last_contribution: TwitchHypeTrainContribution
  level: number
  started_at: string
  top_contributions: TwitchHypeTrainContribution[]
  total: number
}

export interface TwitchHypeTrainEvent {
  id: string
  event_type: string
  event_timestamp: string
  version: string
  event_data: TwitchHypeTrainEventData
}

export interface TwitchPollChoice {
  id: string
  title: string
  votes: number
  channel_points_votes: number
  bits_votes: number
}

export type TwitchPollStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'TERMINATED'
  | 'ARCHIVED'
  | 'MODERATED'
  | 'INVALID'

export interface TwitchPoll {
  id: string
  broadcaster_id: string
  broadcaster_name: string
  broadcaster_login: string
  title: string
  choices: TwitchPollChoice[]
  bits_voting_enabled: boolean
  bits_per_vote: number
  channel_points_voting_enabled: boolean
  channel_points_per_vote: number
  status: TwitchPollStatus
  duration: number
  started_at: string
  ended_at: string | null
}

export interface TwitchPredictionOutcome {
  id: string
  title: string
  users: number
  channel_points: number
  top_predictors: Array<{
    user_id: string
    user_name: string
    user_login: string
    channel_points_used: number
    channel_points_won: number | null
  }>
  color: 'BLUE' | 'PINK'
}

export type TwitchPredictionStatus =
  | 'ACTIVE'
  | 'CANCELED'
  | 'LOCKED'
  | 'RESOLVED'

export interface TwitchPrediction {
  id: string
  broadcaster_id: string
  broadcaster_name: string
  broadcaster_login: string
  title: string
  winning_outcome_id: string | null
  outcomes: TwitchPredictionOutcome[]
  prediction_window: number
  status: TwitchPredictionStatus
  created_at: string
  ended_at: string | null
  locked_at: string | null
}

export interface TwitchBitsLeader {
  user_id: string
  user_login: string
  user_name: string
  rank: number
  score: number
}
