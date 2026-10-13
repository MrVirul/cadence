// Single source of truth for all copy on the Cadence marketing site.
// Written in plain, spoken English with short sentences (under ~20 words).
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
    forTeams: "For teams",
    logIn: "Log in",
    getStarted: "Get started",
  },
  hero: {
    badge: "Weekly Engineering Planning",
    headlinePart1: "Plan the week.",
    headlinePart2: "Ship one thing.",
    supporting:
      "Cadence is a weekly planning tool for engineering teams. Each engineer picks one thing to ship by Friday. Leads approve it fast, and an AI reviewer flags vague tasks.",
    cta: "Get started",
    secondaryCta: "Log in",
  },
  howItWorks: {
    title: "How it works",
    subtitle:
      "A weekly rhythm built around shipping, not around long task lists.",
    steps: [
      {
        step: "01",
        title: "Write the plan",
        description:
          "Write one main task with a why, a few sub-goals, and go-to-market goals.",
      },
      {
        step: "02",
        title: "Get it approved",
        description:
          "The team lead approves your plan or sends it back with a comment.",
      },
      {
        step: "03",
        title: "Track it through the week",
        description:
          "Tick tasks as you work, then close the week with an honest answer: did it ship?",
      },
    ],
  },
  aiSection: {
    title: "The AI",
    subtitle: "A reviewer that says 'that's not a result.'",
    honestLine:
      "The AI only suggests. You decide, and Cadence works without it.",
    cardTitle: "Plan Review in Action",
    card1: {
      categoryLabel: "Main Task",
      title: "Implement checkout",
      finding1: {
        tag: "Describes work, not a result",
        severity: "Blocker",
        problem: "Describes work, not a result.",
        actionLabel: "Suggested title rewrite:",
        rewrite: "Checkout handles expired cards, confirmed on staging",
      },
      finding2: {
        tag: "Missing why",
        severity: "Suggestion",
        problem: "Main task has no reason.",
        actionLabel: "Suggested 'why' rewrite:",
        rewrite: "Failed renewals are our top support ticket this month",
      },
    },
    card2: {
      categoryLabel: "Plan & Goals",
      title: "Goals & Milestones",
      finding1: {
        tag: "Missing go-to-market goal",
        severity: "Suggestion",
        problem: "Plan has no go-to-market goal.",
        actionLabel: "Suggested task to add (Go-to-market goal):",
        rewrite: "Announce card retry fix in #product-updates",
      },
      finding2: {
        tag: "Suggested sub-goal",
        severity: "Suggestion",
        problem: "Main task needs verification steps before release.",
        actionLabel: "Suggested task to add (Sub-goal):",
        rewrite: "Verify webhook retries on staging before Friday release",
      },
    },
  },
  forTeams: {
    title: "For teams",
    subtitle: "See the whole week without asking for updates.",
    points: [
      {
        title: "See the whole week at a glance",
        description:
          "Check commitments across the team in one shared view without status pings.",
      },
      {
        title: "Approve or send back with one comment",
        description:
          "Give clear feedback on Mondays so engineers know what success looks like.",
      },
      {
        title: "See who is on track and how many weeks shipped",
        description:
          "Follow progress through Friday and track real completion rates over time.",
      },
    ],
    table: {
      title: "Team Week",
      subtitle: "Platform • Current Week",
      headers: {
        member: "Member",
        status: "Status",
        tasks: "Tasks",
        shipped: "Shipped",
        plan: "Plan",
      },
    },
  },
  cta: {
    headline: "Start your team's weekly cadence.",
    supporting:
      "One commitment per engineer. Quick approvals. Honest Friday reviews.",
    button: "Get started",
  },
  footer: {
    copyright: "Cadence. All rights reserved.",
    tagline: "Weekly planning for engineering teams.",
  },
};
