import { useState, type FormEvent } from 'react'
import { Reveal } from './Reveal'

interface NotifyBlockProps {
  /** Playful heading, e.g. "want a heads-up when the next lamp exists?" */
  heading: string
  /** Subject tag so Gabriel can see what the sender wants news about. */
  topic: string
}

/**
 * "tell me when something glows" — an email-notify block with zero backend:
 * submitting composes a prefilled email to the studio, so the address arrives
 * as a normal message. Swap the mailto for a real endpoint (worker / form
 * service) when one exists — only `notify()` needs to change.
 */
export function NotifyBlock({ heading, topic }: NotifyBlockProps) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const notify = (event: FormEvent) => {
    event.preventDefault()
    const subject = encodeURIComponent(`keep me posted — ${topic}`)
    const body = encodeURIComponent(
      `hi! please tell me when something new glows.\n\n— ${email}`,
    )
    window.location.href = `mailto:studio@g-magination.com?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <Reveal>
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
        <p className="text-balance text-base font-light lowercase leading-relaxed text-ink sm:text-lg">
          {heading}
        </p>

        <form
          onSubmit={notify}
          className="flex w-full max-w-sm items-center gap-2"
        >
          <label htmlFor={`notify-${topic}`} className="sr-only">
            your email
          </label>
          <input
            id={`notify-${topic}`}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="your@email.com"
            className="min-w-0 flex-1 rounded-md border border-ink/10 bg-white/50 px-5 py-2.5 text-sm font-light lowercase text-ink placeholder:text-taupe/50 focus:border-rose-deep/50 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-ink px-5 py-2.5 text-sm font-medium lowercase text-paper transition-transform hover:scale-105 active:scale-95"
          >
            tell me
          </button>
        </form>

        <p className="text-xs font-light lowercase text-taupe/80">
          {sent
            ? 'your mail app should be opening — hit send and you’re in.'
            : 'a short email when something new glows. nothing else, promise.'}
        </p>
      </div>
    </Reveal>
  )
}
