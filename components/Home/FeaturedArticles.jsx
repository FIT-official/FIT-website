'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ButtonLink from '../Buttons/ButtonLink'

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

function resolveImageSrc(heroImage) {
  if (!heroImage) return '/fitogimage.png'
  if (heroImage.startsWith('http://') || heroImage.startsWith('https://') || heroImage.startsWith('/')) {
    return heroImage
  }
  return `/api/proxy?key=${encodeURIComponent(heroImage)}`
}

function formatDate(value) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB')
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

  return (
    <div className='flex w-full py-20 items-center justify-center px-6 md:px-32 border-b border-borderColor min-h-[50vh]'>
      <div className='flex flex-col w-full gap-10 min-w-0'>
        <div className='flex flex-col md:flex-row md:items-end md:justify-between gap-6'>
          <div className='flex flex-col gap-2'>
            <h3>From the Blog</h3>
            <h2 className="font-semibold text-3xl md:text-4xl tracking-tight">Featured Articles</h2>
          </div>
          <ButtonLink lnk={'/blog'} text={'Browse All Articles'} />
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full'>
          {posts.map((post) => (
            <Link
              key={post._id}
              href={`/blog/${encodeURIComponent(post.slug)}`}
              className='group flex flex-col h-full min-w-0 bg-background border border-borderColor rounded-md overflow-hidden hover:bg-baseColor transition-colors duration-200'
            >
              <div className='relative w-full aspect-[16/10] overflow-hidden shrink-0'>
                <Image
                  src={resolveImageSrc(post.heroImage)}
                  alt={post.title || 'Blog post'}
                  fill
                  sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                  className='object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]'
                />
                {post._id === newestId && (
                  <span className='absolute top-3 left-3 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] rounded-full border border-borderColor bg-background text-textColor'>
                    New
                  </span>
                )}
              </div>

              <div className='flex flex-col flex-1 gap-2 p-5 min-w-0'>
                <div className='flex items-center justify-between gap-2 text-[11px] text-extraLight min-w-0'>
                  <span className='truncate'>{formatDate(post.publishDate || post.createdAt) || ''}</span>
                  {post.readingTimeMinutes ? (
                    <span className='shrink-0'>{post.readingTimeMinutes} min read</span>
                  ) : null}
                </div>

                <h2 className='text-base md:text-lg font-semibold text-textColor line-clamp-2 break-words group-hover:underline underline-offset-4 decoration-borderColor'>
                  {post.title}
                </h2>

                {post.excerpt && (
                  <p className='text-xs md:text-sm text-lightColor line-clamp-3 break-words'>
                    {post.excerpt}
                  </p>
                )}

                <span className='mt-auto pt-2 inline-flex items-center text-[11px] font-medium text-textColor/80 group-hover:text-textColor transition-colors'>
                  Read full article
                  <span className='ml-1 text-xs' aria-hidden='true'>&#8599;</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default FeaturedArticles
