// Single source of truth for all copy on the Cadence marketing site.
// Written in plain, spoken English with short sentences (under 20 words).
// Zero banned hype words.

export const copy = {
  brand: {
    name: "Cadence",
    tagline: "Plan the week. Ship one thing.",
    metaDescription:
      "Cadence is the weekly planning tool for engineering teams: commit to one thing to ship by Friday, leads approve in minutes.",
  },
  nav: {
    howItWorks: "How it works",
    theAi: "The AI",
    forLeads: "For leads",
    logIn: "Log in",
    getStarted: "Get started",
  },
  hero: {
    headline: "Plan the week. Ship one thing.",
    paragraph:
      "Cadence is a weekly planning tool for engineering teams. Each engineer picks one thing to ship by Friday. Leads approve it fast, and an AI reviewer flags vague tasks.",
    cta: "Get started",
    sampleLink: "See a sample review",
    productFrame: {
      srDescription:
        "Preview of the Cadence weekly planner showing a draft plan with an inline AI review suggestion.",
      weekTitle: "Week of Oct 12",
      status: "Draft",
      team: "Platform",
      mainLabel: "Main task (ship by Friday)",
      mainTask: "Implement checkout",
      whyLabel: "Why it matters",
      mainWhy: "Failed renewals cause our top support tickets this month.",
      subGoalsLabel: "Sub-goals",
      subGoal1: "Handle expired cards in Stripe webhook listener",
      subGoal2: "Add unit tests for payment failure retry logic",
      gtmGoalsLabel: "Go-to-market goals",
      gtmGoal1: "Post changelog update for failed renewal flow",
      aiFinding: {
        category: "Describes work, not a result",
        severity: "Blocker",
        problem: "Describes work, not a result.",
        rewriteLabel: "Suggested title rewrite:",
        rewrite: "Checkout handles expired cards, confirmed on staging",
        apply: "Apply",
        dismiss: "Dismiss",
      },
    },
  },
  howAWeekRuns: {
    heading: "How a week runs",
    moments: [
      {
        day: "Mon",
        title: "Monday",
        label: "Write the plan.",
        detail: "One main task, a few sub-goals, and go-to-market goals.",
      },
      {
        day: "Tue",
        title: "Tuesday",
        label: "Get it approved.",
        detail: "Your lead approves it, or sends it back with a comment.",
      },
      {
        day: "Wed–Thu",
        title: "Wednesday – Thursday",
        label: "Tick tasks as you finish them.",
        detail: "",
      },
      {
        day: "Fri",
        title: "Friday",
        label: "Close the week.",
        detail: "Say honestly: did it ship?",
      },
    ] as const,
  },
  theAi: {
    heading: "It says 'that's not a result.'",
    intro:
      "Before you submit, Cadence reads your plan the way a strict lead would. It checks four things:",
    checks: [
      "The task is a result you can check.",
      "The main task says why it matters.",
      "There is a go-to-market goal.",
      "The work fits in a week.",
    ],
    closing: "It only suggests. You decide, and Cadence works without it.",
    diffCard: {
      vagueTask: "Implement checkout",
      vagueReason: "Describes work, not a result",
      rewriteTask: "Checkout handles expired cards, confirmed on staging",
      gtmNotice:
        "No go-to-market goal. Suggested: Announce the card retry fix in the changelog",
      apply: "Apply",
      dismiss: "Dismiss",
    },
  },
  forLeads: {
    heading: "See the whole week without asking for updates.",
    tableTitle: "Platform, this week",
    caption: "Example data",
    legend: {
      shipped: "Shipped",
      notShipped: "Not shipped",
      noPlan: "No plan",
    },
    headers: {
      member: "Member",
      status: "Status",
      tasks: "Tasks",
      shipped: "Shipped",
      recentWeeks: "Last 6 weeks",
    },
    rows: [
      {
        name: "Alex Morgan",
        isLead: true,
        status: "Done",
        statusVariant: "done" as const,
        tasks: "5/5",
        shipped: true,
        history: [
          "shipped",
          "shipped",
          "shipped",
          "shipped",
          "shipped",
          "shipped",
        ] as const,
      },
      {
        name: "Sarah Chen",
        isLead: false,
        status: "Submitted",
        statusVariant: "submitted" as const,
        tasks: "2/4",
        shipped: false,
        history: [
          "shipped",
          "shipped",
          "missed",
          "shipped",
          "shipped",
          "none",
        ] as const,
      },
      {
        name: "Priya Nair",
        isLead: false,
        status: "Approved",
        statusVariant: "approved" as const,
        tasks: "3/5",
        shipped: false,
        history: [
          "shipped",
          "shipped",
          "shipped",
          "missed",
          "shipped",
          "shipped",
        ] as const,
      },
      {
        name: "David Kim",
        isLead: false,
        status: "Not started",
        statusVariant: "not_started" as const,
        tasks: "0/0",
        shipped: false,
        history: [
          "shipped",
          "missed",
          "missed",
          "shipped",
          "shipped",
          "missed",
        ] as const,
      },
    ],
    benefits: [
      "See who has submitted, who is approved and who is done.",
      "Approve or send back with one comment.",
      "Track how many weeks each person shipped.",
    ],
  },
  closing: {
    heading: "Plan your next week in Cadence.",
    cta: "Get started",
  },
  footer: {
    tagline: "Weekly planning for engineering teams.",
    copyright: "Cadence. All rights reserved.",
  },
};
