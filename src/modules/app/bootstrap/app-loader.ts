/** Fade out and remove the `#app-loader` splash that `index.html` ships. */
export function removeAppLoader(): void {
  const loader = document.getElementById('app-loader')
  if (!loader) return

  // Skip transition for users who prefer reduced motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loader.remove()
    return
  }

  loader.style.opacity = '0'
  loader.style.pointerEvents = 'none'
  // { once: true } prevents a listener leak when the transition never fires.
  loader.addEventListener('transitionend', () => loader.remove(), { once: true })
  // Belt-and-suspenders: remove after the longest plausible transition time.
  setTimeout(() => loader.remove(), 500)
}
