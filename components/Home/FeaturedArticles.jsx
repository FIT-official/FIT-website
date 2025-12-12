'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

function FeaturedArticles() {
  const [posts, setPosts] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => 
    {
      try {
        const res = await fetch('/api/admin/blog')
        const data = await res.json()
        if (!data.ok) return

        const all = (data.posts || []).filter(p => p.published)

        const sorted = all
          .map(post => ({
            ...post,
            publishDateFormatted: post.publishDate
              ? new Date(post.publishDate).toLocaleDateString('en-GB')
              : null,
          }))
          .sort((a, b) => new Date(b.publishDate || b.createdAt || 0) - new Date(a.publishDate || a.createdAt || 0))

        setPosts(sorted)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const activePost = posts[activeIndex] || null
  const mostRecentPostId = useMemo(() => (posts[0]?._id || null), [posts])

  const resolveImageSrc = (heroImage) => {
    if (!heroImage) return '/fitogimage.png'
    if (heroImage.startsWith('http://') || heroImage.startsWith('https://') || heroImage.startsWith('/')) {
      return heroImage
    }
    return `/api/proxy?key=${encodeURIComponent(heroImage)}`
  }

  if (loading || !posts.length) {
    return null
  }

  return (
    <div className='flex w-full py-20 items-center justify-center px-12 md:px-32 border-b border-borderColor min-h-[50vh]'>
      <div className='flex flex-col w-full gap-10'>
        <header className='flex flex-col gap-2'>
          <p className='text-[10px] uppercase tracking-[0.2em] text-lightColor'>From the blog</p>
          <h1>Featured blog posts</h1>
        </header>

        <div className='flex flex-col lg:flex-row gap-4 w-full'>

          <div className='flex w-full lg:w-[60%]'>
            {activePost && (
              <article className='flex flex-col w-full bg-background border border-borderColor overflow-hidden h-full'>
                <div className='relative w-full aspect-video overflow-hidden'>
                  <Image
                    src={resolveImageSrc(activePost.heroImage)}
                    alt={activePost.title || 'Blog post'}
                    fill
                    priority
                    className='object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]'
                  />

                  {activePost._id === mostRecentPostId && (
                    <span className='absolute top-3 left-3 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] bg-background text-textColor'>
                      New article
                    </span>
                  )}
                </div>

                <div className='flex flex-col gap-3 p-5 md:p-6'>
                  <div className='flex items-center justify-between text-[11px] text-extraLight gap-2'>
                    <span>{activePost.publishDateFormatted || ''}</span>
                    {activePost.readingTimeMinutes ? (
                      <span>{activePost.readingTimeMinutes} min read</span>
                    ) : null}
                  </div>

                  <Link href={`/blog/${encodeURIComponent(activePost.slug)}`} className='group inline-block'>
                    <h2 className='text-lg md:text-xl font-semibold text-textColor mb-1 group-hover:underline underline-offset-4 decoration-borderColor'>
                      {activePost.title}
                    </h2>
                  </Link>

                  {activePost.excerpt && (
                    <p className='text-xs md:text-sm text-lightColor line-clamp-3 group-hover:text-textColor/90 transition-colors'>
                      {activePost.excerpt}
                    </p>
                  )}

                  <Link
                    href={`/blog/${encodeURIComponent(activePost.slug)}`}
                    className='mt-1 inline-flex items-center text-[11px] font-medium text-textColor/80 hover:text-textColor transition-colors'
                  >
                    Read full article
                    <span className='ml-1 text-xs' aria-hidden='true'>↗</span>
                  </Link>
                </div>
              </article>
            )}
          </div>

          <div className='flex w-full lg:w-[40%]'>
            <div className='flex flex-col gap-3 w-full'>
              {posts.map((post, index) => {
                const isActive = index === activeIndex
                return (
                  <button
                    key={post._id}
                    type='button'
                    onClick={() => setActiveIndex(index)}
                    className={`group relative w-full text-left overflow-hidden border transition-all duration-200 focus:outline-none cursor-pointer ${
                      isActive
                        ? 'border-borderColor bg-background shadow-sm'
                        : 'border-borderColor bg-baseColor hover:bg-borderColor/40'
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className='flex w-full h-24'>
                      <div className='relative w-24 h-24 flex-shrink-0'>
                        <Image
                          src={resolveImageSrc(post.heroImage)}
                          alt={post.title || 'Blog post'}
                          fill
                          className='object-cover'
                        />
                      </div>
                      <div className='flex-1 flex flex-col justify-center px-3 py-2'>
                        <p className='text-[11px] font-semibold text-textColor line-clamp-2'>
                          {post.title}
                        </p>
                        {post.publishDateFormatted && (
                          <span className='text-[10px] text-extraLight mt-0.5'>
                            {post.publishDateFormatted}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeaturedArticles