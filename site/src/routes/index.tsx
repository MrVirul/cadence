import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { APP_URL } from "@/lib/config";
import { copy } from "@/copy";

export const Route = createFileRoute("/")({ component: HomePage });

export function HomePage() {
  const currentYear = new Date().getFullYear();
  const [isScrolled, setIsScrolled] = useState(false);

  // Monitor scroll for header bottom shadow
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // IntersectionObserver for section scroll reveals (runs once per section)
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".section-reveal").forEach((el) => {
        el.classList.add("is-revealed");
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.01, rootMargin: "50px 0px 50px 0px" }
    );

    document.querySelectorAll(".section-reveal").forEach((el) => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // IntersectionObserver for illustration gentle float (active only while in view)
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const elements = document.querySelectorAll(".illustration-float");
    if (!elements.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("float-in-view");
          } else {
            entry.target.classList.remove("float-in-view");
          }
        }
      },
      { threshold: 0.05 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-clip">
      {/* 1. Header */}
      <header
        className={`sticky top-0 z-40 w-full border-b border-border bg-background transition-shadow duration-200 ${
          isScrolled ? "header-scrolled" : ""
        }`}
      >
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
              className="text-sm font-medium text-foreground hover:text-muted-foreground transition-colors duration-150 px-2 py-1.5 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {copy.nav.logIn}
            </a>
            <a
              href={`${APP_URL}/signup`}
              className="btn-primary inline-flex items-center justify-center px-4 py-2 text-sm font-medium"
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
          {/* Centered vertically in row so there is no empty space at bottom left */}
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10 min-w-0">
            {/* Left Column: Heading, Paragraph, CTA */}
            <div className="lg:col-span-6 min-w-0 text-left">
              <h1
                id="hero-heading"
                className="hero-fade-up hero-stagger-1 text-[clamp(40px,5vw,64px)] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground"
              >
                {copy.hero.headline}
              </h1>

              <p className="hero-fade-up hero-stagger-3 mt-6 max-w-[65ch] text-[17px] sm:text-[18px] leading-[1.6] text-muted-foreground">
                {copy.hero.paragraph}
              </p>

              <div className="hero-fade-up hero-stagger-4 mt-8 flex flex-wrap items-center gap-5">
                <a
                  href={`${APP_URL}/signup`}
                  className="btn-primary group inline-flex items-center justify-center px-6 py-3 text-base font-medium"
                >
                  {copy.hero.cta}
                  <span className="arrow-nudge ml-1.5" aria-hidden="true">
                    →
                  </span>
                </a>
                <a
                  href="#the-ai"
                  className="group text-sm font-medium text-primary hover:underline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px] p-1"
                >
                  {copy.hero.sampleLink}{" "}
                  <span className="arrow-nudge inline-block" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
            </div>

            {/* Right Column: Hero Schedule Illustration */}
            <div className="lg:col-span-6 min-w-0 flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-[480px] flex items-center justify-center">
                <img
                  id="hero-illustration-img"
                  src="/schedule.svg"
                  width={500}
                  height={500}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="illustration-float w-full h-auto object-contain hero-fade-up hero-stagger-2"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section divider line matches content container */}
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
          <div className="border-t border-border" />
        </div>

        {/* 3. How a week runs */}
        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="section-reveal">
            <div className="text-left">
              <h2
                id="how-it-works-heading"
                className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground"
              >
                {copy.howAWeekRuns.heading}
              </h2>
            </div>

            {/* Desktop Horizontal Day Rail */}
            <div className="mt-14 hidden md:block">
              {/* Day Labels Row: All day labels sit on the same baseline */}
              <div className="grid grid-cols-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                <span className="col-span-1">Mon</span>
                <span className="col-span-1">Tue</span>
                <span className="col-span-2">Wed – Thu</span>
                <span className="col-span-1">Fri</span>
              </div>

              {/* Rail Line and Dots: Dots sit exactly on the line */}
              <div className="relative h-6 flex items-center mb-6">
                {/* Neutral line connecting Monday to Friday */}
                <div className="absolute left-0 w-[80%] h-[2px] bg-[#E6E3F1]" />
                {/* Purple progress line */}
                <div className="absolute left-0 h-[2px] bg-primary rail-line-progress w-[80%]" />

                {/* Dots row placed on 5-column grid */}
                <div className="grid grid-cols-5 w-full relative z-10 items-center">
                  {/* Mon dot */}
                  <div className="col-span-1 flex items-center">
                    <div className="size-3.5 rounded-full border-2 bg-card rail-dot border-border" />
                  </div>

                  {/* Tue dot */}
                  <div className="col-span-1 flex items-center">
                    <div
                      className="size-3.5 rounded-full border-2 bg-card rail-dot border-border"
                      style={{ transitionDelay: "150ms" }}
                    />
                  </div>

                  {/* Wed-Thu dot */}
                  <div className="col-span-2 flex items-center">
                    <div
                      className="size-3.5 rounded-full border-2 bg-card rail-dot border-border"
                      style={{ transitionDelay: "300ms" }}
                    />
                  </div>

                  {/* Fri dot: filled purple dot with small check mark */}
                  <div className="col-span-1 flex items-center">
                    <div
                      className="size-4.5 rounded-full bg-primary text-white flex items-center justify-center rail-dot-fri -ml-[1px]"
                      style={{ transitionDelay: "500ms" }}
                    >
                      <Check className="size-2.5 stroke-[2.5]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Moments Row: pinned to Mon, Tue, Wed-Thu, Fri */}
              <div className="grid grid-cols-5 gap-6 text-left">
                {/* Mon moment */}
                <div className="col-span-1">
                  <p className="font-semibold text-foreground text-sm">
                    {copy.howAWeekRuns.moments[0].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground text-sm">
                    {copy.howAWeekRuns.moments[0].detail}
                  </p>
                </div>

                {/* Tue moment */}
                <div className="col-span-1">
                  <p className="font-semibold text-foreground text-sm">
                    {copy.howAWeekRuns.moments[1].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground text-sm">
                    {copy.howAWeekRuns.moments[1].detail}
                  </p>
                </div>

                {/* Wed-Thu moment (spans 2 columns) */}
                <div className="col-span-2 pr-6">
                  <p className="font-semibold text-foreground text-sm">
                    {copy.howAWeekRuns.moments[2].label}
                  </p>
                  {copy.howAWeekRuns.moments[2].detail && (
                    <p className="mt-1.5 leading-relaxed text-muted-foreground text-sm">
                      {copy.howAWeekRuns.moments[2].detail}
                    </p>
                  )}
                </div>

                {/* Fri moment */}
                <div className="col-span-1">
                  <p className="font-semibold text-foreground text-sm">
                    {copy.howAWeekRuns.moments[3].label}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground text-sm">
                    {copy.howAWeekRuns.moments[3].detail}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile Vertical Day Rail */}
            <div className="mt-10 relative pl-8 space-y-8 md:hidden text-left">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-4 w-[2px] bg-[#E6E3F1]" />
              <div className="absolute left-[7px] top-2 bottom-4 w-[2px] bg-primary rail-line-progress-v" />

              {copy.howAWeekRuns.moments.map((m, idx) => {
                const isFri = idx === 3;
                return (
                  <div key={idx} className="relative">
                    {/* Dot on the line */}
                    {isFri ? (
                      <div
                        className="absolute -left-[27px] top-1 size-4 rounded-full bg-primary text-white flex items-center justify-center rail-dot-fri"
                        style={{ transitionDelay: "450ms" }}
                      >
                        <Check className="size-2.5 stroke-[2.5]" />
                      </div>
                    ) : (
                      <div
                        className="absolute -left-[25px] top-1.5 size-3 rounded-full border-2 bg-card rail-dot border-border"
                        style={{ transitionDelay: `${idx * 150}ms` }}
                      />
                    )}

                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {m.day}
                    </span>
                    <div className="mt-1.5 text-sm">
                      <p className="font-semibold text-foreground">{m.label}</p>
                      {m.detail && (
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {m.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section divider line */}
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
          <div className="border-t border-border" />
        </div>

        {/* 4. The AI */}
        <section
          id="the-ai"
          aria-labelledby="the-ai-heading"
          className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="section-reveal">
            <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10 min-w-0">
              {/* Left Column: Heading + Checklist + Rule */}
              <div className="lg:col-span-5 min-w-0 text-left">
                <h2
                  id="the-ai-heading"
                  className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground"
                >
                  {copy.theAi.heading}
                </h2>

                <p className="mt-6 text-[17px] leading-[1.6] text-muted-foreground">
                  {copy.theAi.intro}
                </p>

                <ul className="mt-5 space-y-3 text-sm text-foreground">
                  {copy.theAi.checks.map((check, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-primary font-semibold select-none">
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
                    <span className="text-xs font-semibold text-muted-foreground font-mono">
                      plan_review.diff
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      1 blocker • 1 suggestion
                    </span>
                  </div>

                  {/* Diff Lines */}
                  <div className="divide-y divide-border text-sm">
                    {/* Blocker: Vague task vs Rewrite */}
                    <div className="p-4 space-y-2.5 text-left">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-[6px] border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {copy.theAi.diffCard.vagueReason}
                        </span>
                      </div>

                      {/* Red line with minus */}
                      <div className="rounded-[6px] border border-red-200 bg-[#FEF2F2] px-3 py-2 text-sm font-mono flex items-start gap-2.5 text-[#B91C1C]">
                        <span className="font-semibold select-none">-</span>
                        <span>{copy.theAi.diffCard.vagueTask}</span>
                      </div>

                      {/* Green line with plus */}
                      <div className="rounded-[6px] border border-emerald-200 bg-[#F0FDF4] px-3 py-2 text-sm font-mono flex items-start gap-2.5 text-[#15803D]">
                        <span className="font-semibold select-none">+</span>
                        <span>{copy.theAi.diffCard.rewriteTask}</span>
                      </div>
                    </div>

                    {/* Second row: GTM goal notice */}
                    <div className="border-t border-border bg-secondary/30 px-4 py-3 text-xs sm:text-sm text-foreground text-left">
                      {copy.theAi.diffCard.gtmNotice}
                    </div>
                  </div>

                  {/* Actions bar */}
                  <div
                    aria-hidden="true"
                    className="flex items-center justify-end gap-2.5 border-t border-border bg-card px-4 py-3 select-none"
                  >
                    <div className="inline-flex items-center justify-center rounded-[6px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
                      {copy.theAi.diffCard.dismiss}
                    </div>
                    <div className="inline-flex items-center justify-center rounded-[6px] bg-primary px-3 py-1.5 text-xs font-medium text-white">
                      <Check className="mr-1 size-3.5" />
                      {copy.theAi.diffCard.apply}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section divider line */}
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
          <div className="border-t border-border" />
        </div>

        {/* 5. For leads */}
        <section
          id="for-leads"
          aria-labelledby="for-leads-heading"
          className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="section-reveal">
            <div className="text-left">
              <h2
                id="for-leads-heading"
                className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground"
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
                        {copy.forLeads.rows.map((row, rowIdx) => (
                          <tr
                            key={row.name}
                            className="team-row hover:bg-secondary/40 transition-colors duration-150"
                            style={{ transitionDelay: `${rowIdx * 70}ms` }}
                          >
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5 font-medium text-foreground">
                                <Avatar
                                  seed={row.name}
                                  size={26}
                                  className="team-avatar"
                                />
                                <div className="flex items-center gap-1.5">
                                  <span>{row.name}</span>
                                  {row.isLead && (
                                    <Badge
                                      variant="secondary"
                                      className="px-1.5 py-0 text-[10px] font-semibold border-border bg-secondary text-foreground"
                                    >
                                      Lead
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              {row.statusVariant === "done" && (
                                <span className="inline-flex items-center rounded-[6px] border border-emerald-200 bg-[#F0FDF4] px-2 py-0.5 text-xs font-medium text-[#15803D]">
                                  {row.status}
                                </span>
                              )}
                              {row.statusVariant === "submitted" && (
                                <span className="inline-flex items-center rounded-[6px] border border-amber-200 bg-[#FFFBEB] px-2 py-0.5 text-xs font-medium text-[#92400E]">
                                  {row.status}
                                </span>
                              )}
                              {row.statusVariant === "approved" && (
                                <span className="inline-flex items-center rounded-[6px] border border-indigo-200 bg-[#F5F3FF] px-2 py-0.5 text-xs font-medium text-primary">
                                  {row.status}
                                </span>
                              )}
                              {row.statusVariant === "not_started" && (
                                <span className="inline-flex items-center rounded-[6px] border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  {row.status}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 tabular-nums text-xs font-medium text-foreground">
                              {row.tasks}
                            </td>
                            <td className="px-4 py-3.5">
                              {row.shipped ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D]">
                                  <Check className="size-3.5 text-[#15803D]" />
                                  Shipped
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {/* 12px marks: shipped = filled green square, not shipped = outlined square with x, no plan = small grey dot */}
                              <div
                                className="flex items-center gap-1.5"
                                aria-label="Last 6 weeks history"
                              >
                                {row.history.map((h, hIdx) => (
                                  <span
                                    key={hIdx}
                                    className="size-3 flex items-center justify-center history-mark"
                                    style={{
                                      transitionDelay: `${rowIdx * 70 + hIdx * 50}ms`,
                                    }}
                                    title={
                                      h === "shipped"
                                        ? "Shipped"
                                        : h === "missed"
                                          ? "Not shipped"
                                          : "No plan"
                                    }
                                  >
                                    {h === "shipped" ? (
                                      <span className="size-3 rounded-[2px] bg-[#15803D]" />
                                    ) : h === "missed" ? (
                                      <span className="size-3 rounded-[2px] border border-border bg-card flex items-center justify-center text-[8px] font-semibold text-muted-foreground leading-none select-none">
                                        ×
                                      </span>
                                    ) : (
                                      <span className="size-1.5 rounded-full bg-[#94A3B8]" />
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

                {/* Caption + Clearly Readable Legend */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="text-muted-foreground font-medium">
                    {copy.forLeads.caption}
                  </span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-3 rounded-[2px] bg-[#15803D]"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">
                        {copy.forLeads.legend.shipped}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-border">
                      •
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-3 rounded-[2px] border border-border bg-card flex items-center justify-center text-[8px] font-semibold text-muted-foreground leading-none"
                        aria-hidden="true"
                      >
                        ×
                      </span>
                      <span className="font-medium text-foreground">
                        {copy.forLeads.legend.notShipped}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-border">
                      •
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full bg-[#94A3B8]"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">
                        {copy.forLeads.legend.noPlan}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Plain Benefits List Column */}
              <div className="lg:col-span-4 text-left">
                <ul className="space-y-4 text-sm sm:text-base text-foreground">
                  {copy.forLeads.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-primary font-semibold select-none">
                        •
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Closing band: solid ink band with 2 columns (left: heading + CTA, right: illustration) */}
        <section
          aria-labelledby="closing-heading"
          className="bg-[#0B0B14] text-white py-16 sm:py-24"
        >
          <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
            <div className="grid lg:grid-cols-12 gap-10 items-center">
              {/* Left Column: Heading + Get started button */}
              <div className="lg:col-span-7 text-left">
                <h2
                  id="closing-heading"
                  className="text-[clamp(28px,3.5vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-white"
                >
                  {copy.closing.heading}
                </h2>

                <div className="mt-8">
                  <a
                    href={`${APP_URL}/signup`}
                    className="btn-primary group inline-flex items-center justify-center px-6 py-3 text-base font-medium"
                  >
                    {copy.closing.cta}
                    <span className="arrow-nudge ml-1.5" aria-hidden="true">
                      →
                    </span>
                  </a>
                </div>
              </div>

              {/* Right Column: Illustration on rounded 12px soft purple panel inside ink band */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <div className="w-full max-w-[420px] rounded-[12px] bg-[#F5F3FF] p-4 sm:p-6 border border-[#DDD6FE]/30 flex items-center justify-center">
                  <img
                    id="closing-illustration-img"
                    src="/schedule.svg"
                    width={500}
                    height={500}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="illustration-float w-full h-auto object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer: subtle surface with hairline border and Storyset attribution */}
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
            {/* Storyset Credit Link */}
            <a
              href={copy.footer.storysetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-[6px]"
            >
              {copy.footer.storysetCredit}
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
