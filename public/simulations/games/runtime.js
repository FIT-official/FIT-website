import { createSession, LEVEL_COUNT } from './shared.js'

export function mountGame(host, game, { seed = 'FIT-2026', model = '' } = {}) {
  let session = createSession(game, seed), board
  host.innerHTML = `<main class="game-root" data-game-id="${game.id}">
    <header class="game-header"><a href="/classes/simulations" target="_top" class="game-brand">FIT <span>/ PLAY & DISCOVER</span></a><span class="game-badge">Maths studio</span></header>
    <div class="game-intro"><p class="game-eyebrow"></p><h1></h1><p class="game-subtitle"></p></div>
    <section class="game-panel" aria-label="Game challenge">
      <div class="game-progress"><span class="game-level"></span><span class="game-stars" aria-label="Completed challenges"></span><strong class="game-score" aria-live="polite"></strong></div>
      <div class="game-mission"><span class="game-eyebrow">YOUR CHALLENGE</span><h2 id="game-prompt" tabindex="-1"></h2></div>
      <div class="game-board"></div>
      <div class="game-feedback" id="game-feedback" role="status" aria-live="polite"></div>
      <div class="game-actions"><button class="game-button game-primary" data-action="check" type="button">Check answer <span aria-hidden="true">→</span></button><button class="game-button" data-action="reset" type="button">Start this challenge again</button><button class="game-button game-primary" data-action="next" type="button" hidden>Next challenge <span aria-hidden="true">→</span></button><button class="game-button game-primary" data-action="replay" type="button" hidden>Play again</button></div>
    </section>
    <details class="game-theory"><summary>The maths behind the game</summary><p></p></details>
    <footer class="game-footer">Six challenges · 100 points on your first try, 75 on your second, then 50. One star per solved challenge. Restarting a challenge keeps its attempt count. Scores last for this visit.</footer>
  </main>`
  const root = host.querySelector('main'), $ = selector => root.querySelector(selector)
  $('.game-intro h1').textContent = game.title
  $('.game-subtitle').textContent = game.subtitle
  $('.game-intro .game-eyebrow').textContent = game.id.startsWith('ratio') ? 'RATIO / MAKE THE PARTS FIT' : 'FRACTIONS / PARTS OF A WHOLE'
  $('.game-theory p').textContent = model
  const feedback = $('#game-feedback'), checkButton = $('[data-action="check"]'), resetButton = $('[data-action="reset"]')
  const nextButton = $('[data-action="next"]'), replayButton = $('[data-action="replay"]')
  const api = {
    get challenge() { return session.challenge }, get answer() { return session.answer }, get solved() { return session.solved },
    setAnswer(next) {
      if (session.solved) return
      session.setAnswer(next)
      feedback.textContent = ''; feedback.className = 'game-feedback'
      board?.update()
    },
    check() {
      if (session.solved) return
      const result = session.check()
      feedback.className = `game-feedback ${result.correct ? 'game-success' : 'game-retry'}`
      feedback.textContent = result.correct
        ? `${session.level === LEVEL_COUNT ? 'All six challenges complete!' : 'You got it!'} +${result.awarded} points. ${game.explain(session.challenge, session.answer)}`
        : `Try another arrangement. ${game.hint?.(session.challenge, session.answer) || 'Check the quantities in the challenge, then try again.'}`
      update()
      board?.update()
      if (result.correct) (session.level === LEVEL_COUNT ? replayButton : nextButton).focus({ preventScroll: true })
    },
  }
  function update() {
    $('.game-level').textContent = `Challenge ${session.level} / ${LEVEL_COUNT}`
    $('.game-score').textContent = `${session.points} points`
    $('.game-stars').textContent = '★'.repeat(session.stars) + '☆'.repeat(LEVEL_COUNT - session.stars)
    $('.game-stars').setAttribute('aria-label', `${session.stars} of ${LEVEL_COUNT} stars`)
    $('#game-prompt').textContent = session.challenge.prompt
    checkButton.hidden = session.solved; resetButton.hidden = session.solved
    nextButton.hidden = !session.solved || session.level === LEVEL_COUNT
    replayButton.hidden = !session.solved || session.level !== LEVEL_COUNT
    root.dataset.state = session.solved ? 'success' : 'playing'
    root.dataset.level = String(session.level)
  }
  function openBoard(focus = false) {
    board?.destroy()
    $('.game-board').replaceChildren()
    feedback.textContent = ''; feedback.className = 'game-feedback'
    update()
    board = game.createBoard($('.game-board'), api)
    board.update()
    if (focus) $('#game-prompt').focus({ preventScroll: true })
  }
  checkButton.onclick = api.check
  resetButton.onclick = () => { session.resetAnswer(); feedback.textContent = ''; board.update() }
  nextButton.onclick = () => { if (session.next()) openBoard(true) }
  replayButton.onclick = () => { session = createSession(game, seed); openBoard(true) }
  openBoard()
  return { destroy() { board?.destroy(); host.replaceChildren() } }
}
