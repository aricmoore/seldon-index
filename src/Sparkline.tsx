interface SparklineProps {
  values: number[]
  width?: number
  height?: number
}

export default function Sparkline({ values, width = 640, height = 120 }: SparklineProps) {
  if (values.length < 2) {
    return <svg width={width} height={height} className="sparkline" />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 8

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" role="img" aria-label="Index value over time">
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} className="sparkline-area" fill="url(#sparkline-fill)" />
      <path d={linePath} className="sparkline-line" pathLength={100} />
      <circle cx={lastX} cy={lastY} r={4} className="sparkline-dot" />
    </svg>
  )
}
