// Original, dependency-free decorative artwork. No simulator data is inferred.
export function roundedShape(context, x, y, width, height, radius = 12) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

export function drawBackdrop(context, width, height, accent = '#5361d8') {
  context.clearRect(0, 0, width, height)
  const wash = context.createLinearGradient(0, 0, width, height)
  wash.addColorStop(0, '#f4f3ee')
  wash.addColorStop(1, '#ffffff')
  context.fillStyle = wash
  context.fillRect(0, 0, width, height)
  context.save()
  context.globalAlpha = 0.12
  context.strokeStyle = accent
  context.lineWidth = 1
  for (let x = 0; x < width; x += 24) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
  }
  for (let y = 0; y < height; y += 24) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
  }
  context.restore()
  const tileWidth = Math.min(132, width * 0.26)
  for (let tile = 0; tile < 3; tile++) {
    const x = width / 2 + (tile - 1.5) * (tileWidth + 14) + 7
    context.save()
    context.shadowColor = 'rgba(17, 17, 17, 0.09)'
    context.shadowBlur = 18
    context.shadowOffsetY = 5
    context.fillStyle = '#ffffff'
    roundedShape(context, x, 13, tileWidth, height - 26, 13)
    context.fill()
    context.restore()
    context.strokeStyle = accent
    context.fillStyle = accent
    context.lineWidth = 2.5
    context.beginPath()
    for (let i = 0; i <= 36; i++) {
      const px = x + 12 + i / 36 * (tileWidth - 24)
      const py = height / 2 + Math.sin(i / 36 * Math.PI * (tile + 1) * 2) * 13
      if (i === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.stroke()
  }
}

export function celebrationParticles(width, height, count = 28) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2
    const speed = 45 + (index % 5) * 15
    return { x: width / 2, y: height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, size: 3 + index % 4, color: ['#5361d8', '#bc6529', '#087c72', '#f2c461'][index % 4] }
  })
}

export function drawCelebration(context, particles, seconds) {
  context.save()
  context.globalAlpha = Math.max(0, 1 - seconds / 1.2)
  for (const particle of particles) {
    context.fillStyle = particle.color
    roundedShape(context, particle.x + particle.vx * seconds, particle.y + particle.vy * seconds + 65 * seconds * seconds, particle.size, particle.size * 1.6, 2)
    context.fill()
  }
  context.restore()
}
