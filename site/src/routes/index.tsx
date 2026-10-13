import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo, Logomark } from "@/components/logo";
import { APP_URL } from "@/lib/config";
import { copy } from "@/copy";

export const Route = createFileRoute("/")({ component: HomePage });

export function HomePage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* 1. Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            aria-label="Cadence home"
          >
            <Logo />
          </a>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
          >
            <a
              href="#how-it-works"
              className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm cursor-pointer"
            >
              {copy.nav.howItWorks}
            </a>
            <a
              href="#the-ai"
              className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm cursor-pointer"
            >
              {copy.nav.theAi}
            </a>
            <a
              href="#for-teams"
              className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm cursor-pointer"
            >
              {copy.nav.forTeams}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={`${APP_URL}/login`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            >
              {copy.nav.logIn}
            </a>
            <a
              href={`${APP_URL}/signup`}
              className={`${buttonVariants({ size: "sm" })} cursor-pointer`}
            >
              {copy.nav.getStarted}
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Hero */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28"
        >
          {/* Subtle grid backdrop */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] [mask-image:radial-gradient(ellipse_60%_100%_at_50%_0%,black,transparent)]"
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
          </div>

          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="mb-6 flex items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80 border-border"
              >
                {copy.hero.badge}
              </Badge>
            </div>

            <h1
              id="hero-heading"
              className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl text-foreground"
            >
              {copy.hero.headlinePart1}{" "}
              <span className="text-primary">{copy.hero.headlinePart2}</span>
            </h1>

            <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl leading-relaxed">
              {copy.hero.supporting}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href={`${APP_URL}/signup`}
                className={`${buttonVariants({ size: "lg" })} h-11 px-6 text-base cursor-pointer`}
              >
                {copy.hero.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a
                href={`${APP_URL}/login`}
                className={`${buttonVariants({ variant: "outline", size: "lg" })} h-11 px-6 text-base cursor-pointer`}
              >
                {copy.hero.secondaryCta}
              </a>
            </div>
          </div>
        </section>

        {/* 3. How it works */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="border-t border-border/80 bg-muted/20 px-4 py-20 sm:px-6"
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2
                id="how-it-works-heading"
                className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {copy.howItWorks.title}
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                {copy.howItWorks.subtitle}
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-3">
              {copy.howItWorks.steps.map((item) => (
                <Card
                  key={item.step}
                  className="flex flex-col justify-between border-border bg-card p-6 transition-all hover:border-foreground/20"
                >
                  <CardHeader className="p-0 gap-3">
                    <span className="text-sm font-bold tracking-wider text-primary font-mono">
                      {item.step}
                    </span>
                    <CardTitle className="p-0">
                      <h3 className="text-xl font-semibold text-foreground">
                        {item.title}
                      </h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 pt-4 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 4. The AI, shown for real */}
        <section
          id="the-ai"
          aria-labelledby="the-ai-heading"
          className="border-t border-border/80 px-4 py-20 sm:px-6"
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <Badge
                variant="outline"
                className="mb-3 rounded-full border-primary/30 bg-primary/10 text-primary text-xs font-medium"
              >
                <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
                {copy.aiSection.title}
              </Badge>
              <h2
                id="the-ai-heading"
                className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {copy.aiSection.subtitle}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base font-medium text-foreground/90 sm:text-lg">
                {copy.aiSection.honestLine}
              </p>
            </div>

            {/* Rendered plan review components */}
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {/* Card 1: Main Task Review (Blocker + Suggestion) */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {copy.aiSection.card1.categoryLabel}
                      </span>
                      <h3 className="font-semibold text-foreground text-base">
                        {copy.aiSection.card1.title}
                      </h3>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 text-xs shrink-0"
                    >
                      1 blocker • 1 suggestion
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    {/* Finding 1: Blocker (Dark Amber Tint) */}
                    <div className="rounded-lg border border-[#b45309] bg-[#451a03] p-4 text-[#fef3c7] shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AlertTriangle
                          className="size-4 shrink-0 text-[#fde68a]"
                          aria-hidden="true"
                        />
                        <span className="inline-flex items-center rounded-md border border-[#b45309] bg-[#78350f] px-2 py-0.5 text-xs font-medium text-[#fef3c7]">
                          {copy.aiSection.card1.finding1.tag}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-[#dc2626] bg-[#991b1b] px-2 py-0.5 text-xs font-semibold text-[#fef2f2] uppercase tracking-wide">
                          {copy.aiSection.card1.finding1.severity}
                        </span>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-[#fef3c7]">
                        {copy.aiSection.card1.finding1.problem}
                      </p>

                      <div className="mt-3 rounded-md border border-[#78350f] bg-[#270e02] p-3">
                        <p className="text-[11px] font-medium text-[#fde68a]">
                          {copy.aiSection.card1.finding1.actionLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#ffffff]">
                          {copy.aiSection.card1.finding1.rewrite}
                        </p>
                      </div>

                      <div
                        aria-hidden="true"
                        className="mt-3.5 flex items-center gap-2 select-none"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] px-3 py-1.5 text-xs font-medium text-white shadow-xs cursor-pointer">
                          <Check className="size-3.5" />
                          Apply
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-900/60 hover:bg-amber-800/80 px-3 py-1.5 text-xs font-medium text-[#fef3c7] shadow-xs cursor-pointer">
                          <X className="size-3.5" />
                          Dismiss
                        </span>
                      </div>
                    </div>

                    {/* Finding 2: Suggestion (Dark Indigo Tint) */}
                    <div className="rounded-lg border border-[#4338ca] bg-[#1e1b4b] p-4 text-[#e0e7ff] shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Info
                          className="size-4 shrink-0 text-[#c7d2fe]"
                          aria-hidden="true"
                        />
                        <span className="inline-flex items-center rounded-md border border-[#4f46e5] bg-[#312e81] px-2 py-0.5 text-xs font-medium text-[#e0e7ff]">
                          {copy.aiSection.card1.finding2.tag}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-[#475569] bg-[#1e293b] px-2 py-0.5 text-xs font-medium text-[#f8fafc]">
                          {copy.aiSection.card1.finding2.severity}
                        </span>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-[#e0e7ff]">
                        {copy.aiSection.card1.finding2.problem}
                      </p>

                      <div className="mt-3 rounded-md border border-[#3730a3] bg-[#100e2b] p-3">
                        <p className="text-[11px] font-medium text-[#c7d2fe]">
                          {copy.aiSection.card1.finding2.actionLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#ffffff]">
                          {copy.aiSection.card1.finding2.rewrite}
                        </p>
                      </div>

                      <div
                        aria-hidden="true"
                        className="mt-3.5 flex items-center gap-2 select-none"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] px-3 py-1.5 text-xs font-medium text-white shadow-xs cursor-pointer">
                          <Check className="size-3.5" />
                          Apply
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-400/40 bg-indigo-900/60 hover:bg-indigo-800/80 px-3 py-1.5 text-xs font-medium text-[#e0e7ff] shadow-xs cursor-pointer">
                          <X className="size-3.5" />
                          Dismiss
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Plan & Goals Review (Two Suggestions) */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {copy.aiSection.card2.categoryLabel}
                      </span>
                      <h3 className="font-semibold text-foreground text-base">
                        {copy.aiSection.card2.title}
                      </h3>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200 text-xs shrink-0"
                    >
                      2 suggestions
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    {/* Finding 1: Missing GTM (Dark Indigo Tint) */}
                    <div className="rounded-lg border border-[#4338ca] bg-[#1e1b4b] p-4 text-[#e0e7ff] shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Info
                          className="size-4 shrink-0 text-[#c7d2fe]"
                          aria-hidden="true"
                        />
                        <span className="inline-flex items-center rounded-md border border-[#4f46e5] bg-[#312e81] px-2 py-0.5 text-xs font-medium text-[#e0e7ff]">
                          {copy.aiSection.card2.finding1.tag}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-[#475569] bg-[#1e293b] px-2 py-0.5 text-xs font-medium text-[#f8fafc]">
                          {copy.aiSection.card2.finding1.severity}
                        </span>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-[#e0e7ff]">
                        {copy.aiSection.card2.finding1.problem}
                      </p>

                      <div className="mt-3 rounded-md border border-[#3730a3] bg-[#100e2b] p-3">
                        <p className="text-[11px] font-medium text-[#c7d2fe]">
                          {copy.aiSection.card2.finding1.actionLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#ffffff]">
                          {copy.aiSection.card2.finding1.rewrite}
                        </p>
                      </div>

                      <div
                        aria-hidden="true"
                        className="mt-3.5 flex items-center gap-2 select-none"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] px-3 py-1.5 text-xs font-medium text-white shadow-xs cursor-pointer">
                          <Check className="size-3.5" />
                          Apply
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-400/40 bg-indigo-900/60 hover:bg-indigo-800/80 px-3 py-1.5 text-xs font-medium text-[#e0e7ff] shadow-xs cursor-pointer">
                          <X className="size-3.5" />
                          Dismiss
                        </span>
                      </div>
                    </div>

                    {/* Finding 2: Sub-goal (Dark Indigo Tint) */}
                    <div className="rounded-lg border border-[#4338ca] bg-[#1e1b4b] p-4 text-[#e0e7ff] shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Info
                          className="size-4 shrink-0 text-[#c7d2fe]"
                          aria-hidden="true"
                        />
                        <span className="inline-flex items-center rounded-md border border-[#4f46e5] bg-[#312e81] px-2 py-0.5 text-xs font-medium text-[#e0e7ff]">
                          {copy.aiSection.card2.finding2.tag}
                        </span>
                        <span className="inline-flex items-center rounded-md border border-[#475569] bg-[#1e293b] px-2 py-0.5 text-xs font-medium text-[#f8fafc]">
                          {copy.aiSection.card2.finding2.severity}
                        </span>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-[#e0e7ff]">
                        {copy.aiSection.card2.finding2.problem}
                      </p>

                      <div className="mt-3 rounded-md border border-[#3730a3] bg-[#100e2b] p-3">
                        <p className="text-[11px] font-medium text-[#c7d2fe]">
                          {copy.aiSection.card2.finding2.actionLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#ffffff]">
                          {copy.aiSection.card2.finding2.rewrite}
                        </p>
                      </div>

                      <div
                        aria-hidden="true"
                        className="mt-3.5 flex items-center gap-2 select-none"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] px-3 py-1.5 text-xs font-medium text-white shadow-xs cursor-pointer">
                          <Check className="size-3.5" />
                          Apply
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-400/40 bg-indigo-900/60 hover:bg-indigo-800/80 px-3 py-1.5 text-xs font-medium text-[#e0e7ff] shadow-xs cursor-pointer">
                          <X className="size-3.5" />
                          Dismiss
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. For teams */}
        <section
          id="for-teams"
          aria-labelledby="for-teams-heading"
          className="border-t border-border/80 bg-muted/20 px-4 py-20 sm:px-6"
        >
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2
                id="for-teams-heading"
                className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {copy.forTeams.title}
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                {copy.forTeams.subtitle}
              </p>
            </div>

            {/* Rendered mini table of the team's week */}
            <div className="mt-12 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              <div className="border-b border-border bg-muted/40 px-4 py-3">
                <span className="text-sm font-semibold text-foreground">
                  {copy.forTeams.table.title}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {copy.forTeams.table.subtitle}
                </span>
              </div>

              {/* Scroll container for responsiveness down to 360px */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <caption className="sr-only">
                    Engineering team weekly commitments overview
                  </caption>
                  <thead className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        {copy.forTeams.table.headers.member}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {copy.forTeams.table.headers.status}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {copy.forTeams.table.headers.tasks}
                      </th>
                      <th scope="col" className="px-4 py-3">
                        {copy.forTeams.table.headers.shipped}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        {copy.forTeams.table.headers.plan}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {/* Row 1: Alex: Done, 5/5, Shipped */}
                    <tr className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          Alex Morgan
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 text-[10px]"
                          >
                            Lead
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          Done
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-2 w-16 overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                          >
                            <div className="h-full rounded-full bg-emerald-600 w-full" />
                          </div>
                          <span className="text-xs font-medium tabular-nums">
                            5 / 5
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          <CheckCircle2
                            className="mr-1 size-3.5 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                          Shipped
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-xs font-medium text-primary">
                          View
                        </span>
                      </td>
                    </tr>

                    {/* Row 2: Approved, 3/5, a dash */}
                    <tr className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">
                          Elena Rostova
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800/80 dark:bg-indigo-950/40 dark:text-indigo-200"
                        >
                          Approved
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-2 w-16 overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                          >
                            <div className="h-full rounded-full bg-primary w-[60%]" />
                          </div>
                          <span className="text-xs font-medium tabular-nums">
                            3 / 5
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-xs font-medium text-primary">
                          View
                        </span>
                      </td>
                    </tr>

                    {/* Row 3: Sarah: Submitted, 2/4, a dash */}
                    <tr className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">
                          Sarah Chen
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200"
                        >
                          Submitted
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-2 w-16 overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                          >
                            <div className="h-full rounded-full bg-primary w-[50%]" />
                          </div>
                          <span className="text-xs font-medium tabular-nums">
                            2 / 4
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Review
                        </span>
                      </td>
                    </tr>

                    {/* Row 4: David: Not started, 0/0, a dash */}
                    <tr className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-foreground">
                          David Kim
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"
                        >
                          Not started
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground">
                          0 / 0
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Three key points for leads */}
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {copy.forTeams.points.map((point) => (
                <div
                  key={point.title}
                  className="rounded-lg border border-border bg-card p-5"
                >
                  <h3 className="text-base font-semibold text-foreground">
                    {point.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Final Call to Action */}
        <section
          aria-labelledby="cta-heading"
          className="border-t border-border/80 px-4 py-20 text-center sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-3xl">
            <h2
              id="cta-heading"
              className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              {copy.cta.headline}
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              {copy.cta.supporting}
            </p>
            <div className="mt-8 flex justify-center">
              <a
                href={`${APP_URL}/signup`}
                className={`${buttonVariants({ size: "lg" })} h-11 px-8 text-base cursor-pointer`}
              >
                {copy.cta.button}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Logomark className="size-6" />
            <span className="text-sm font-semibold text-foreground">
              {copy.brand.name}
            </span>
            <span className="text-xs text-muted-foreground">
              — {copy.footer.tagline}
            </span>
          </div>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground"
          >
            <a
              href="#how-it-works"
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              {copy.nav.howItWorks}
            </a>
            <a
              href="#the-ai"
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              {copy.nav.theAi}
            </a>
            <a
              href="#for-teams"
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              {copy.nav.forTeams}
            </a>
            <a
              href={`${APP_URL}/login`}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              {copy.nav.logIn}
            </a>
          </nav>

          <div className="text-xs text-muted-foreground">
            © {currentYear} {copy.footer.copyright}
          </div>
        </div>
      </footer>
    </div>
  );
}
