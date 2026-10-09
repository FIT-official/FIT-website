'use client'

import { useEffect, useState } from 'react'
import ArticleCards from './ArticleCards'

const MAX_CARDS = 3

// Featured posts first (newest first), most recent posts fill the rest.
function pickPosts(all) {
  const sorted = [...all].sort(
    (a, b) => new Date(b.publishDate || b.createdAt || 0) - new Date(a.publishDate || a.createdAt || 0)
  )
  const featured = sorted.filter((p) => p.featured)
  const rest = sorted.filter((p) => !p.featured)
  return [...featured, ...rest].slice(0, MAX_CARDS)
}

function FeaturedArticles() {
  const [posts, setPosts] = useState([])
  const [newestId, setNewestId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/blog')
        const data = await res.json()
        if (!data.ok) return
        const all = data.posts || []
        const newest = [...all].sort(
          (a, b) => new Date(b.publishDate || b.createdAt || 0) - new Date(a.publishDate || a.createdAt || 0)
        )[0]
        setNewestId(newest?._id || null)
        setPosts(pickPosts(all))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading || !posts.length) {
    return null
  }

  return <ArticleCards posts={posts} newestId={newestId} />
}

export default FeaturedArticles
