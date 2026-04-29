export interface YouTubeCategory {
  id: string
  label: string
  description: string
  searchQuery: string
  icon: string
}

export const YOUTUBE_CATEGORIES: YouTubeCategory[] = [
  {
    id: 'popular',
    label: 'Popular',
    description: 'Trending and most-watched videos',
    searchQuery: '',
    icon: 'flame',
  },
  {
    id: 'dev-ai',
    label: 'Dev AI News',
    description: 'AI tools, models, and developer news',
    searchQuery: 'Latest Dev AI News',
    icon: 'bot',
  },
  {
    id: 'live-coding',
    label: 'Live Coding',
    description: 'Live coding sessions and tutorials',
    searchQuery: 'Live coding programming',
    icon: 'code',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    description: 'Gaming highlights and gameplay',
    searchQuery: 'Gaming highlights',
    icon: 'gamepad-2',
  },
  {
    id: 'music',
    label: 'Music',
    description: 'Music videos and performances',
    searchQuery: 'Music videos',
    icon: 'music',
  },
  {
    id: 'tech-reviews',
    label: 'Tech Reviews',
    description: 'Latest tech reviews and comparisons',
    searchQuery: 'Tech review 2026',
    icon: 'monitor',
  },
]

export const DEFAULT_CATEGORY_ID = 'popular'

export function getCategoryById(id: string): YouTubeCategory | undefined {
  return YOUTUBE_CATEGORIES.find((c) => c.id === id)
}
