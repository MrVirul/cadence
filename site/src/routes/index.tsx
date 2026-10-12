import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Calendar,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo, Logomark } from "@/components/logo";

const pillars = [
  {
    icon: Calendar,
    title: "The Weekly Commitment",
    body: "Every engineer commits to one main thing to ship by Friday. No vague tickets, no carry-over work.",
  },
  {
    icon: Sparkles,
    title: "AI Reviewer in the Loop",
    body: "Pushes back on vague tasks and missing why statements before the Monday morning meeting does.",
  },
  {
    icon: CheckCircle2,
    title: "Leads Approve in Minutes",
    body: "Clear weekly commitments and checkable outcomes make approvals straightforward and decisions fast.",
  },
];

const checklist = [
  "One main task per engineer with checkable outcomes",
  "Sub-goals and go-to-market milestones accounted for",
  "AI plan review and notes drafting with clear rationale",
  "Zero cross-org leaks: tenant-safe, role-enforced core",
];

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 py-20 font-[family-name:var(--font-geist-sans)]">
      {/* Decorative grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] [mask-image:radial-gradient(ellipse_60%_100%_at_50%_0%,black,transparent)]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      </div>

      <div className="flex w-full max-w-4xl flex-col items-center gap-14 text-center">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6">
          <Logo className="scale-125" />
          <Badge variant="outline" className="rounded-full bg-background/60">
            Weekly Engineering Planning
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Plan the week.{" "}
            <span className="text-[#4F46E5]">Ship one thing.</span>
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground">
            Cadence is the weekly planning tool for engineering teams: every
            engineer commits to one thing to ship by Friday, leads approve in
            minutes, and an AI reviewer pushes back on vague tasks before the
            Monday meeting does.
          </p>
        </div>

        {/* The three pillars */}
        <div className="grid w-full gap-4 text-left sm:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }) => (
            <Card
              key={title}
              className="gap-4 transition-colors hover:border-foreground/20"
            >
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg border bg-muted/40 text-[#4F46E5]">
                    <Icon className="size-4.5" strokeWidth={1.75} />
                  </span>
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {body}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ritual overview */}
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border bg-muted/30 text-left">
          <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="ml-2 text-xs font-mono text-muted-foreground">
              the weekly cadence
            </span>
          </div>
          <div className="p-5 font-mono text-xs space-y-2 text-foreground/80 leading-relaxed">
            <p>
              <span className="text-[#4F46E5] font-semibold">Monday:</span>{" "}
              Commit to 1 main ship goal + why + sub-goals. AI reviews inline.
            </p>
            <p>
              <span className="text-[#4F46E5] font-semibold">
                Tuesday–Thursday:
              </span>{" "}
              Execute and tick sub-goals todo ⇄ done.
            </p>
            <p>
              <span className="text-[#4F46E5] font-semibold">Friday:</span>{" "}
              Close the week with an honest answer: did it ship?
            </p>
          </div>
        </div>

        {/* Checklist */}
        <ul className="grid w-full max-w-2xl gap-x-8 gap-y-3 text-left text-sm text-muted-foreground sm:grid-cols-2">
          {checklist.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[#16A34A]"
                strokeWidth={2.5}
              />
              {item}
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            className={buttonVariants({ size: "lg" })}
            href="http://localhost:3001/login"
          >
            Open Cadence App
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 flex items-center gap-2 text-xs text-muted-foreground">
        <Logomark className="size-4" />
        <span>Cadence — Weekly planning for engineering teams.</span>
      </footer>
    </main>
  );
}
