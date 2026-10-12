// Tablero de consumo para Claude Code, pensado para el plan Pro o Max.
// Abre un panel con /consumo y muestra cinco datos que se actualizan en vivo.
//   1. Tokens del último pedido y total de la sesión
//   2. Uso del plan, con cada límite, cuándo se reinicia y su equivalente en API
//   3. Contexto lleno
//   4. Herramientas usadas
//   5. Tiempo de sesión

const PANE = 'consumo'

// Datos que comparten los hooks
let isOpen = false
let lastRequest = null // { input, output, cacheRead, cacheWrite, model }
let sessionTokens = 0
let requests = 0
let toolCalls = 0

// Formato

const formatTokens = (n) => {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(Math.round(n))
}

const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v) => String(v).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const formatReset = (resetsAt, now) => {
  if (!resetsAt) return ''
  const target = typeof resetsAt === 'number' ? resetsAt : Date.parse(resetsAt)
  if (!Number.isFinite(target)) return ''
  const diff = target - now
  if (diff <= 0) return 'se reinicia ya'
  const minutes = Math.ceil(diff / 60_000)
  if (minutes < 60) return `se reinicia en ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return `se reinicia en ${hours} h ${rest} min`
  return `se reinicia en ${Math.floor(hours / 24)} d ${hours % 24} h`
}

const limitLabel = (kind) => {
  const k = String(kind ?? '').toLowerCase()
  if (k.includes('five') || k.includes('5h') || k.includes('session')) return 'Ventana de 5 horas'
  if (k.includes('opus')) return 'Semanal Opus'
  if (k.includes('sonnet')) return 'Semanal Sonnet'
  if (k.includes('week') || k.includes('seven') || k.includes('7d')) return 'Semanal'
  if (k.includes('spend')) return 'Límite de gasto'
  return kind ? String(kind) : 'Límite'
}

const bar = (percent, width) => {
  const p = Math.min(100, Math.max(0, Number(percent) || 0))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const colorFor = (percent) => {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'yellow'
  return 'green'
}

const redraw = ($) => {
  if (isOpen) $.ui.invalidate('ui.render')
}

export function register(on) {
  // Comando /consumo y refresco del reloj
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consumo',
      description: 'Abre el tablero de consumo de la sesión',
      immediate: true,
    })
    $.clock.every(1000, () => redraw($))
    return next(e)
  })

  // Abre el panel, o lo cierra si ya está abierto
  on('command.run', { command: 'consumo' }, async ($) => {
    if (isOpen) {
      await $.ui.close({ id: PANE })
      isOpen = false
      return {}
    }
    const placed = await $.ui.open({ id: PANE, title: 'Consumo', closeOnEscape: true, columns: 52 })
    isOpen = true
    if (placed && placed.isPlaced === false) {
      $.ui.toast('El tablero espera una terminal más ancha')
    }
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isOpen = false
    return next(e)
  })

  // Cuenta cada herramienta que Claude usa
  on('tool.call', async ($, e, next) => {
    toolCalls += 1
    redraw($)
    return next(e)
  })

  // Lee los tokens de cada pedido al modelo
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result && result.usage
    if (usage) {
      const input = usage.input_tokens ?? 0
      const output = usage.output_tokens ?? 0
      const cacheRead = usage.cache_read_input_tokens ?? 0
      const cacheWrite = usage.cache_creation_input_tokens ?? 0
      sessionTokens += input + output + cacheRead + cacheWrite
      requests += 1
      // El último pedido muestra solo la conversación principal, no los subagentes
      if (!e.agentId) {
        lastRequest = { input, output, cacheRead, cacheWrite, model: usage.model ?? result.model }
      }
      redraw($)
    }
    return result
  })

  // Claude Code avisa cuando cambia el uso del plan
  on('session.measure', async ($, e, next) => {
    redraw($)
    return next(e)
  })

  // Al limpiar la sesión, el tablero empieza de cero
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      lastRequest = null
      sessionTokens = 0
      requests = 0
      toolCalls = 0
    }
    return next(e)
  })

  // Dibuja el panel
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const columns = Math.max(24, (e.props && e.props.bodyColumns) || 40)
    const barWidth = Math.max(10, Math.min(24, columns - 16))
    const now = Date.now()

    let usage = null
    try {
      usage = await $.session.usage()
    } catch {
      usage = null
    }

    const title = (text) => Text({ bold: true, children: [text] })
    const dim = (text) => Text({ dimColor: true, wrap: 'truncate-end', children: [text] })
    const line = (text, props = {}) => Text({ wrap: 'truncate-end', ...props, children: [text] })
    const gap = () => Text({ children: [' '] })

    // Autoría, justo bajo el título del panel
    const sections = [dim('Creado por Stephano · @iOStephano · 8pluscore.com'), gap()]

    // 1. Tokens
    sections.push(title('1. Tokens'))
    if (lastRequest) {
      const total = lastRequest.input + lastRequest.output + lastRequest.cacheRead + lastRequest.cacheWrite
      sections.push(line(`Último pedido   ${formatTokens(total)}`))
      sections.push(dim(`entrada ${formatTokens(lastRequest.input)}  salida ${formatTokens(lastRequest.output)}`))
      sections.push(dim(`caché leída ${formatTokens(lastRequest.cacheRead)}  escrita ${formatTokens(lastRequest.cacheWrite)}`))
    } else {
      sections.push(dim('Todavía no hay pedidos'))
    }
    sections.push(line(`Sesión          ${formatTokens(sessionTokens)} en ${requests} pedidos`))
    sections.push(gap())

    // 2. Uso del plan
    sections.push(title('2. Uso del plan'))
    const limits = (usage && Array.isArray(usage.rateLimits)) ? usage.rateLimits : []
    if (limits.length === 0) {
      sections.push(dim('Sin datos del plan en esta sesión'))
    } else {
      for (const limit of limits) {
        const percent = Math.round(Number(limit.percentUsed) || 0)
        sections.push(line(limitLabel(limit.kind)))
        sections.push(
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ color: colorFor(percent), children: [bar(percent, barWidth)] }),
              Text({ children: [`${percent}%`] }),
            ],
          }),
        )
        const reset = formatReset(limit.resetsAt, now)
        if (reset) sections.push(dim(reset))
      }
    }
    const usd = usage && usage.cost && Number(usage.cost.usd)
    if (Number.isFinite(usd) && usd > 0) {
      sections.push(dim(`Equivalente en API  US$ ${usd.toFixed(2)}`))
    }
    sections.push(gap())

    // 3. Contexto
    sections.push(title('3. Contexto lleno'))
    const context = usage && usage.context
    if (context && Number.isFinite(Number(context.percent))) {
      const percent = Math.round(Number(context.percent))
      sections.push(
        Box({
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ color: colorFor(percent), children: [bar(percent, barWidth)] }),
            Text({ children: [`${percent}%`] }),
          ],
        }),
      )
      sections.push(dim(`${formatTokens(context.tokens)} de ${formatTokens(context.window)} tokens`))
    } else {
      sections.push(dim('Sin datos de contexto todavía'))
    }
    sections.push(gap())

    // 4. Herramientas
    sections.push(title('4. Herramientas usadas'))
    sections.push(line(`${toolCalls} llamadas`))
    sections.push(gap())

    // 5. Tiempo
    sections.push(title('5. Tiempo de sesión'))
    const startedAt = usage && usage.startedAt
    const start = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt ?? '')
    sections.push(line(Number.isFinite(start) ? formatDuration(now - start) : 'Sin datos'))

    return Box({ flexDirection: 'column', width: columns, children: sections })
  })
}
