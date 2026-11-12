/**
 * Minimal "scroll" affordance for the bottom of the hero: a lowercase label
 * above a thin line with a travelling rose light. Colors live in index.css
 * (.cue-*) so they can flip with the hero's dark phase.
 */
export function ScrollCue() {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="cue-label text-[0.6rem] font-medium lowercase tracking-[0.32em]">
        scroll (there's a switch)
      </span>
      <div className="cue-line relative h-14 w-px overflow-hidden">
        <span className="cue-light animate-cue absolute inset-x-0 top-0 h-5" />
      </div>
    </div>
  )
}
