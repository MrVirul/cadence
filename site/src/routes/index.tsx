import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { APP_URL } from "@/lib/config";
import { copy } from "@/copy";

export const Route = createFileRoute("/")({ component: HomePage });

export function HomePage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-clip">
      {/* 1. Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Cadence home"
          >
            <Logo />
          </a>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex"
          >
            <a
              href="#how-it-works"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.howItWorks}
            </a>
            <a
              href="#the-ai"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.theAi}
            </a>
            <a
              href="#for-leads"
              className="transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.forLeads}
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href={`${APP_URL}/login`}
              className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors duration-150 px-2 py-1.5 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {copy.nav.logIn}
            </a>
            <a
              href={`${APP_URL}/signup`}
              className="inline-flex items-center justify-center rounded-[6px] bg-[#4F46E5] hover:bg-[#4338CA] text-white px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
          className="mx-auto w-full max-w-[1120px] px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-24"
        >
          <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10 min-w-0">
            {/* Left Column: Heading, Paragraph, CTA */}
            <div className="lg:col-span-6 min-w-0 text-left">
              <h1
                id="hero-heading"
                className="text-[clamp(40px,5vw,64px)] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground text-balance"
              >
                {copy.hero.headline}
              </h1>

              <p className="mt-6 max-w-[65ch] text-[17px] sm:text-[18px] leading-[1.6] text-muted-foreground">
                {copy.hero.paragraph}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5">
                <a
                  href={`${APP_URL}/signup`}
                  className="inline-flex items-center justify-center rounded-[6px] bg-[#4F46E5] hover:bg-[#4338CA] text-white px-6 py-3 text-base font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {copy.hero.cta}
                </a>
                <a
                  href="#the-ai"
                  className="text-sm font-medium text-[#4F46E5] hover:underline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px] p-1"
                >
                  {copy.hero.sampleLink} →
                </a>
              </div>
            </div>

            {/* Right Column: ProductFrame (the ONLY element with a shadow) */}
            <div className="lg:col-span-6 min-w-0">
              <ProductFrame />
            </div>
          </div>
        </section>

        {/* 3. How a week runs */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="border-t border-border mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="text-left">
            <h2
              id="how-it-works-heading"
              className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground"
            >
              {copy.howAWeekRuns.heading}
            </h2>
          </div>

          {/* Desktop Horizontal Day Rail */}
          <div className="mt-12 hidden md:block">
            <div className="grid grid-cols-5 border-t border-border pt-4">
              {/* MON */}
              <div className="relative col-span-1 pr-6">
                <div className="absolute -top-[21px] left-0 size-2 rounded-full bg-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mon
                </span>
                <div className="mt-4 text-sm">
                  <p className="font-semibold text-foreground">
                    {copy.howAWeekRuns.moments[0].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">
                    {copy.howAWeekRuns.moments[0].detail}
                  </p>
                </div>
              </div>

              {/* TUE */}
              <div className="relative col-span-1 pr-6">
                <div className="absolute -top-[21px] left-0 size-2 rounded-full bg-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tue
                </span>
                <div className="mt-4 text-sm">
                  <p className="font-semibold text-foreground">
                    {copy.howAWeekRuns.moments[1].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">
                    {copy.howAWeekRuns.moments[1].detail}
                  </p>
                </div>
              </div>

              {/* WED - THU */}
              <div className="relative col-span-2 pr-6">
                <div className="absolute -top-[21px] left-0 size-2 rounded-full bg-foreground" />
                <div className="absolute -top-[21px] left-1/2 size-2 rounded-full bg-foreground" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Wed
                  </span>
                  <span className="text-xs text-muted-foreground">–</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Thu
                  </span>
                </div>
                <div className="mt-4 text-sm">
                  <p className="font-semibold text-foreground">
                    {copy.howAWeekRuns.moments[2].label}
                  </p>
                </div>
              </div>

              {/* FRI */}
              <div className="relative col-span-1">
                <div className="absolute -top-[21px] left-0 size-2 rounded-full bg-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fri
                </span>
                <div className="mt-4 text-sm">
                  <p className="font-semibold text-foreground">
                    {copy.howAWeekRuns.moments[3].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">
                    {copy.howAWeekRuns.moments[3].detail}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Vertical Day Rail */}
          <div className="mt-8 ml-2 border-l border-border pl-6 space-y-8 md:hidden">
            {copy.howAWeekRuns.moments.map((m, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[29px] top-1.5 size-2 rounded-full bg-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.day}
                </span>
                <div className="mt-2 text-sm">
                  <p className="font-semibold text-foreground">{m.label}</p>
                  {m.detail && (
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {m.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. The AI */}
        <section
          id="the-ai"
          aria-labelledby="the-ai-heading"
          className="border-t border-border mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10 min-w-0">
            {/* Left Column: Heading + Checklist + Rule */}
            <div className="lg:col-span-5 min-w-0 text-left">
              <h2
                id="the-ai-heading"
                className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground text-balance"
              >
                {copy.theAi.heading}
              </h2>

              <p className="mt-6 text-[17px] leading-[1.6] text-muted-foreground">
                {copy.theAi.intro}
              </p>

              <ul className="mt-5 space-y-3 text-sm text-foreground">
                {copy.theAi.checks.map((check, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="text-[#4F46E5] font-semibold select-none">
                      •
                    </span>
                    <span>{check}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm font-medium text-muted-foreground">
                {copy.theAi.closing}
              </p>
            </div>

            {/* Right Column: Code-Review Diff Card */}
            <div className="lg:col-span-7 min-w-0">
              <div className="rounded-[12px] border border-border bg-card overflow-hidden">
                {/* Diff Header */}
                <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    plan_review.diff
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    1 blocker • 1 suggestion
                  </span>
                </div>

                {/* Diff Lines */}
                <div className="divide-y divide-border text-sm">
                  {/* Blocker: Vague task vs Rewrite */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-[6px] border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-[#475569]">
                        {copy.theAi.diffCard.vagueReason}
                      </span>
                    </div>

                    {/* Red line with minus */}
                    <div className="rounded-[6px] border border-red-200 bg-[#FEF2F2] px-3 py-2 text-sm font-mono flex items-start gap-2.5 text-[#991B1B]">
                      <span className="font-semibold select-none">-</span>
                      <span>{copy.theAi.diffCard.vagueTask}</span>
                    </div>

                    {/* Green line with plus */}
                    <div className="rounded-[6px] border border-emerald-200 bg-[#F0FDF4] px-3 py-2 text-sm font-mono flex items-start gap-2.5 text-[#166534]">
                      <span className="font-semibold select-none">+</span>
                      <span>{copy.theAi.diffCard.rewriteTask}</span>
                    </div>
                  </div>

                  {/* Second row: GTM goal notice (clean sans-serif) */}
                  <div className="border-t border-border bg-secondary/30 px-4 py-3 text-xs sm:text-sm text-foreground">
                    {copy.theAi.diffCard.gtmNotice}
                  </div>
                </div>

                {/* Actions bar */}
                <div
                  aria-hidden="true"
                  className="flex items-center justify-end gap-2.5 border-t border-border bg-card px-4 py-3 select-none"
                >
                  <div className="inline-flex items-center justify-center rounded-[6px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-[#0F172A]">
                    {copy.theAi.diffCard.dismiss}
                  </div>
                  <div className="inline-flex items-center justify-center rounded-[6px] bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white">
                    <Check className="mr-1 size-3.5" />
                    {copy.theAi.diffCard.apply}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. For leads */}
        <section
          id="for-leads"
          aria-labelledby="for-leads-heading"
          className="border-t border-border mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="text-left">
            <h2
              id="for-leads-heading"
              className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground text-balance"
            >
              {copy.forLeads.heading}
            </h2>
          </div>

          <div className="mt-10 grid items-start gap-10 lg:grid-cols-12 min-w-0">
            {/* Table Column */}
            <div className="lg:col-span-8 min-w-0 max-w-full">
              <div className="rounded-[12px] border border-border bg-card overflow-hidden w-full max-w-full">
                <div className="border-b border-border bg-secondary/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {copy.forLeads.tableTitle}
                  </span>
                </div>

                {/* Scroll container for responsiveness down to 360px */}
                <div className="overflow-x-auto w-full max-w-full">
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead className="border-b border-border bg-secondary/30 text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          {copy.forLeads.headers.member}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {copy.forLeads.headers.status}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {copy.forLeads.headers.tasks}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {copy.forLeads.headers.shipped}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          {copy.forLeads.headers.recentWeeks}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      {copy.forLeads.rows.map((row) => (
                        <tr
                          key={row.name}
                          className="hover:bg-secondary/40 transition-colors duration-150"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              {row.name}
                              {row.isLead && (
                                <Badge
                                  variant="secondary"
                                  className="px-1.5 py-0 text-[10px] font-semibold border-border"
                                >
                                  Lead
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {row.statusVariant === "done" && (
                              <span className="inline-flex items-center rounded-[6px] border border-emerald-200 bg-[#F0FDF4] px-2 py-0.5 text-xs font-medium text-[#166534]">
                                {row.status}
                              </span>
                            )}
                            {row.statusVariant === "submitted" && (
                              <span className="inline-flex items-center rounded-[6px] border border-amber-200 bg-[#FFFBEB] px-2 py-0.5 text-xs font-medium text-[#92400E]">
                                {row.status}
                              </span>
                            )}
                            {row.statusVariant === "approved" && (
                              <span className="inline-flex items-center rounded-[6px] border border-indigo-200 bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#3730A3]">
                                {row.status}
                              </span>
                            )}
                            {row.statusVariant === "not_started" && (
                              <span className="inline-flex items-center rounded-[6px] border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-[#475569]">
                                {row.status}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-xs font-medium text-foreground">
                            {row.tasks}
                          </td>
                          <td className="px-4 py-3.5">
                            {row.shipped ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#166534]">
                                <Check className="size-3.5 text-[#166534]" />
                                Shipped
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div
                              className="flex items-center gap-1.5"
                              aria-label="Last 6 weeks history"
                            >
                              {row.history.map((h, idx) => (
                                <span
                                  key={idx}
                                  className="size-3.5 flex items-center justify-center"
                                  title={
                                    h === "shipped"
                                      ? "Shipped"
                                      : h === "missed"
                                        ? "Not shipped"
                                        : "No plan"
                                  }
                                >
                                  {h === "shipped" ? (
                                    <span className="size-3 rounded-[2px] bg-[#16A34A]" />
                                  ) : h === "missed" ? (
                                    <span className="size-3 rounded-[2px] border border-border bg-card flex items-center justify-center text-[8px] font-semibold text-[#475569] leading-none select-none">
                                      ×
                                    </span>
                                  ) : (
                                    <span className="size-1.5 rounded-full bg-[#A8A29E]" />
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Caption + Legend (matches exact marks from table) */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="text-[#475569]">{copy.forLeads.caption}</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-3 rounded-[2px] bg-[#16A34A]"
                      aria-hidden="true"
                    />
                    <span>{copy.forLeads.legend.shipped}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-3 rounded-[2px] border border-border bg-card flex items-center justify-center text-[8px] font-semibold text-[#475569] leading-none"
                      aria-hidden="true"
                    >
                      ×
                    </span>
                    <span>{copy.forLeads.legend.notShipped}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full bg-[#A8A29E]"
                      aria-hidden="true"
                    />
                    <span>{copy.forLeads.legend.noPlan}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Plain Benefits List Column */}
            <div className="lg:col-span-4 text-left">
              <ul className="space-y-4 text-sm sm:text-base text-foreground">
                {copy.forLeads.benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="text-[#4F46E5] font-semibold select-none">
                      •
                    </span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 6. Closing band: solid ink band with white text */}
        <section
          aria-labelledby="closing-heading"
          className="bg-[#0F172A] text-white py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 text-left">
            <h2
              id="closing-heading"
              className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-white"
            >
              {copy.closing.heading}
            </h2>

            <div className="mt-8">
              <a
                href={`${APP_URL}/signup`}
                className="inline-flex items-center justify-center rounded-[6px] bg-[#4F46E5] hover:bg-[#4338CA] text-white px-6 py-3 text-base font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-[#0F172A]"
              >
                {copy.closing.cta}
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer: subtle surface #F4F4F2 with hairline top border */}
      <footer className="border-t border-border bg-secondary py-10">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Logo />
            <span className="text-xs text-muted-foreground">
              — {copy.footer.tagline}
            </span>
          </div>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground"
          >
            <a
              href="#how-it-works"
              className="hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.howItWorks}
            </a>
            <a
              href="#the-ai"
              className="hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.theAi}
            </a>
            <a
              href="#for-leads"
              className="hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.nav.forLeads}
            </a>
            <a
              href={`${APP_URL}/login`}
              className="hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
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

function ProductFrame() {
  const p = copy.hero.productFrame;

  return (
    <div
      aria-hidden="true"
      className="relative rounded-[12px] border border-border bg-card p-5 sm:p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] select-none text-left"
    >
      <span className="sr-only">{p.srDescription}</span>

      {/* Week Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {p.team}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="inline-flex items-center rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-xs font-medium text-[#92400E]">
              {p.status}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {p.weekTitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-[6px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
            Save
          </div>
          <div className="rounded-[6px] bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white">
            Submit
          </div>
        </div>
      </div>

      {/* Main Task Editor */}
      <div className="mt-4 space-y-3.5">
        <div>
          <label className="text-xs font-semibold text-foreground">
            {p.mainLabel}
          </label>
          <div className="mt-1.5 rounded-[6px] border border-border bg-card px-3 py-2 text-sm text-foreground">
            {p.mainTask}
          </div>
        </div>

        {/* Inline AI Finding Card - Light amber tint */}
        <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-[#92400E]" />
            <span className="inline-flex items-center rounded-[6px] border border-[#FDE68A] bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E]">
              {p.aiFinding.category}
            </span>
            <span className="inline-flex items-center rounded-[6px] border border-[#FDE68A] bg-card px-2 py-0.5 text-[11px] font-semibold uppercase text-[#92400E]">
              {p.aiFinding.severity}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[#0F172A]">
            {p.aiFinding.problem}
          </p>

          {/* Suggested rewrite in white box with 1px border */}
          <div className="mt-2.5 rounded-[6px] border border-[#E7E5E4] bg-card p-2.5">
            <p className="text-[11px] font-medium text-[#475569]">
              {p.aiFinding.rewriteLabel}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#0F172A]">
              {p.aiFinding.rewrite}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#4F46E5] px-2.5 py-1 text-xs font-medium text-white">
              <Check className="size-3.5" />
              {p.aiFinding.apply}
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#E7E5E4] bg-card px-2.5 py-1 text-xs font-medium text-[#0F172A]">
              <X className="size-3.5" />
              {p.aiFinding.dismiss}
            </div>
          </div>
        </div>

        {/* Why it matters */}
        <div>
          <label className="text-xs font-semibold text-foreground">
            {p.whyLabel}
          </label>
          <div className="mt-1.5 rounded-[6px] border border-border bg-card px-3 py-2 text-xs text-foreground">
            {p.mainWhy}
          </div>
        </div>
      </div>

      {/* Sub-goals */}
      <div className="mt-4 border-t border-border pt-3.5">
        <span className="text-xs font-semibold text-foreground">
          {p.subGoalsLabel}
        </span>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2.5 rounded-[6px] border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
            <div className="size-3.5 rounded-[3px] border border-border bg-card" />
            <span>{p.subGoal1}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-[6px] border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
            <div className="size-3.5 rounded-[3px] border border-border bg-card" />
            <span>{p.subGoal2}</span>
          </div>
        </div>
      </div>

      {/* GTM goals */}
      <div className="mt-3.5 border-t border-border pt-3.5">
        <span className="text-xs font-semibold text-foreground">
          {p.gtmGoalsLabel}
        </span>
        <div className="mt-2">
          <div className="flex items-center gap-2.5 rounded-[6px] border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
            <div className="size-3.5 rounded-[3px] border border-border bg-card" />
            <span>{p.gtmGoal1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
