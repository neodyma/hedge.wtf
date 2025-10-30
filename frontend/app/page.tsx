"use client"

import { motion } from "framer-motion"
import {
  ArrowRight,
  Cpu,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Feature = {
  description: string
  icon: LucideIcon
  title: string
}

type Metric = {
  label: string
  value: string
}

type Step = {
  description: string
  title: string
}

type Testimonial = {
  name: string
  quote: string
  role: string
}

const featureHighlights: Feature[] = [
  {
    description:
      "More accurate risk models allow for a safer position at higher utilization rates.",
    icon: ShieldCheck,
    title: "Protecting your Portfolio",
  },
  {
    description:
      "Live volatility feeds tune collateral factors in real-time to keep capital productive without compromising safety.",
    icon: Cpu,
    title: "Adaptive Risk Engine",
  },
  {
    description:
      "Helping users diversify exposure across assets.",
    icon: Layers,
    title: "Allowing every usecase",
  },
  {
    description:
      "Discover new assets and take position on the latest market trends.",
    icon: Sparkles,
    title: "One Market for Everyone",
  },
]

const heroCards: Metric[] = [
  { label: "Live deposits", value: "$68.4M" },
  { label: "Borrow utilization", value: "74%" },
  { label: "Liquidation-free days", value: "182" },
]



const keyMetrics: Metric[] = [
  { label: "Risk-adjusted borrows", value: "$62.1M" },
  { label: "Capital efficiency boost", value: "32%" },
  { label: "Institutions onboarded", value: "120+" },
]

const onboardingSteps: Step[] = [
  {
    description:
      "Link any Solana wallet or custody solution to get instant access to pools and on-chain analytics.",
    title: "Connect your wallet",
  },
  {
    description:
      "Deploy capital into curated pools or craft custom hedged positions with per-asset transparency.",
    title: "Choose your strategy",
  },
  {
    description:
      "Enable guardrails, alerts, and auto-rollovers so positions stay optimal through market swings.",
    title: "Automate performance",
  },
]

const partnerLogos: string[] = [
  "Solana",
  "Pyth Network",
  "Helius",
]

const sectionVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
}

const testimonials: Testimonial[] = [
  {
    name: "Ava Moreno",
    quote:
      "Hedge.wtf helps our desk deploy idle stables without sacrificing responsiveness. Risk controls are responsive and transparent.",
    role: "Principal, Meridian Digital Assets",
  },
  {
    name: "Noah Choi",
    quote:
      "The protocol's modular SDK let us integrate lending into our consumer app in weeks, not months. Our users love the UX.",
    role: "Lead Engineer, Orbital Labs",
  },
]

const listStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
}

export default function Home() {
  return (
    <main className="relative flex-1">
      <div className="bg-background relative isolate overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[url('/background-texture.png')] opacity-70"
          style={{ backgroundRepeat: "repeat" }}
        />
        <div className="from-background/60 via-background/80 to-background pointer-events-none absolute inset-0 bg-gradient-to-b" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-24 px-4 py-16 sm:px-6 md:gap-28 lg:px-8 lg:py-24">
          <HeroSection />
          <PartnersSection />
          <FeaturesSection />
          {/* <HowItWorksSection /> */}
          {/* <CommunitySection />
          <FinalCtaSection /> */}
        </div>
      </div>
    </main>
  )
}

const HeroSection = () => (
  <motion.section
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center gap-12 md:flex-row md:items-start md:gap-16"
    initial={{ opacity: 0, y: 24 }}
    transition={{ duration: 0.6, ease: "easeOut" }}
  >
    <motion.div
      animate="visible"
      className="flex w-full flex-col items-center text-center md:items-start md:text-left"
      initial="hidden"
      variants={listStagger}
    >
      <motion.span
        className="text-primary/80 font-mono text-xs font-bold tracking-[0.32em] uppercase"
        variants={sectionVariants}
      >
        Unified Portfolio Hedging
      </motion.span>
      <motion.h1
        className="text-foreground mt-4 text-4xl leading-tight font-[500] tracking-tight sm:text-5xl lg:text-6xl"
        variants={sectionVariants}
      >
        One Market.
        Infinite Use Cases.
      </motion.h1>

      <motion.p
        className="text-muted-foreground mt-6 max-w-xl text-base sm:text-lg"
        variants={sectionVariants}
      >
        Maximize your Portfolio and stay safe from liquidation on Solana.
      </motion.p>

      <motion.div
        className="mt-8 flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-start"
        variants={sectionVariants}
      >
        <Button asChild className="w-full sm:w-auto" size="lg">
          <Link href="/market">
            Launch app
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild className="w-full sm:w-auto" size="lg" variant="outline">
          <Link href="https://docs.hedge.wtf" rel="noreferrer" target="_blank">
            View docs
          </Link>
        </Button>
      </motion.div>

    </motion.div>

    <motion.div
      animate={{ y: [0, -10, 0] }}
      className="relative w-full max-w-md shrink-0 md:max-w-lg"
      transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
    >
      <Card className="border-foreground/30 bg-card/80 rounded-2xl border backdrop-blur">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            Live protocol telemetry
            <Zap className="text-primary size-4" />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4">
            {heroCards.map((card) => (
              <motion.div
                className="border-foreground/15 bg-background/60 rounded-xs border px-4 py-3"
                key={card.label}
                variants={sectionVariants}
              >
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-xs uppercase">{card.label}</div>
                  <TrendingUp className="text-primary/80 size-4" />
                </div>
                <div className="mt-2 font-mono text-xl font-semibold">{card.value}</div>
              </motion.div>
            ))}
          </div>

        </CardContent>
      </Card>
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        aria-hidden
        className="bg-primary/20 absolute -top-12 -right-8 hidden h-32 w-32 rounded-full blur-3xl md:block"
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
      />
    </motion.div>
  </motion.section>
)

const PartnersSection = () => (
  <motion.section
    animate="visible"
    className="w-full"
    initial="hidden"
    transition={{ duration: 0.5, ease: "easeOut" }}
    variants={sectionVariants}
    viewport={{ amount: 0.2, once: true }}
    whileInView="visible"
  >
    <Card className="border-foreground/20 bg-card/70 rounded-xs border backdrop-blur-sm">
      <CardContent className="flex flex-col gap-6 py-6">
        <div className="text-muted-foreground text-xs tracking-[0.3em] uppercase">
          Empowered through
        </div>
        <div className="mask-scroll-x flex flex-wrap items-center gap-4 text-sm sm:flex-nowrap sm:overflow-x-auto">
          {partnerLogos.map((partner) => (
            <span
              className="border-foreground/20 bg-background/60 text-muted-foreground rounded-full border px-4 py-2 font-mono tracking-tight whitespace-nowrap backdrop-blur"
              key={partner}
            >
              {partner}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  </motion.section>
)


const FeaturesSection = () => (
  <motion.section
    animate="visible"
    className="flex flex-col gap-10"
    initial="hidden"
    transition={{ duration: 0.5, ease: "easeOut" }}
    variants={sectionVariants}
    viewport={{ amount: 0.2, once: true }}
    whileInView="visible"
  >
    <SectionHeading
      description="."
      eyebrow="Why hedge.wtf"
      title="Open-source.
Stress-tested. Countless times."
    />
    <div className="grid gap-4 md:grid-cols-2">
      {featureHighlights.map((feature) => (
        <FeatureCard feature={feature} key={feature.title} />
      ))}
    </div>
  </motion.section>
)

const HowItWorksSection = () => (
  <motion.section
    animate="visible"
    className="flex flex-col gap-10"
    initial="hidden"
    transition={{ duration: 0.5, ease: "easeOut" }}
    variants={sectionVariants}
    viewport={{ amount: 0.2, once: true }}
    whileInView="visible"
  >
    <SectionHeading
      description="Pair your custodial stack with our automation suite and bring on-chain credit to your workflow."
      eyebrow="Onboarding flow"
      title="From discovery to deployment in minutes."
    />
    <div className="grid gap-6 md:grid-cols-3">
      {onboardingSteps.map((step, index) => (
        <motion.div
          className={cn(
            "border-foreground/20 bg-card/80 relative rounded-xs border p-6 backdrop-blur",
            "md:bg-card/70 md:border",
          )}
          key={step.title}
          variants={sectionVariants}
        >
          <div className="border-primary/40 bg-primary/10 text-primary absolute top-0 left-6 -translate-y-1/2 rounded-full border px-3 py-1 font-mono text-xs md:left-1/2 md:-translate-x-1/2">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="mt-6 space-y-3 text-left md:mt-10">
            <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.section>
)

const CommunitySection = () => (
  <motion.section
    animate="visible"
    className="flex flex-col gap-10"
    initial="hidden"
    transition={{ duration: 0.5, ease: "easeOut" }}
    variants={sectionVariants}
    viewport={{ amount: 0.2, once: true }}
    whileInView="visible"
  >
    <SectionHeading
      description="Join a growing set of funds, protocols, and builders expanding what composable credit can do."
      eyebrow="Voices from the network"
      title="Community operators scaling with hedge.wtf."
    />
    <div className="grid gap-4 md:grid-cols-2">
      {testimonials.map((testimonial) => (
        <motion.div
          className="border-foreground/20 bg-secondary/40 rounded-xs border p-6 shadow-sm backdrop-blur"
          key={testimonial.name}
          variants={sectionVariants}
        >
          <p className="text-foreground text-base leading-relaxed">
            &ldquo;{testimonial.quote}&rdquo;
          </p>
          <div className="mt-4 text-sm">
            <div className="font-semibold">{testimonial.name}</div>
            <div className="text-muted-foreground">{testimonial.role}</div>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.section>
)

const FinalCtaSection = () => (
  <motion.section
    animate="visible"
    className="border-primary/20 bg-primary/10 relative overflow-hidden rounded-2xl border p-8 sm:p-10 md:p-12"
    initial="hidden"
    transition={{ duration: 0.5, ease: "easeOut" }}
    variants={sectionVariants}
    viewport={{ amount: 0.2, once: true }}
    whileInView="visible"
  >
    <motion.div
      animate={{ opacity: [0.2, 0.5, 0.2] }}
      aria-hidden
      className="bg-primary/40 absolute -top-24 right-10 hidden h-48 w-48 rounded-full blur-3xl md:block"
      transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
    />
    <div className="relative flex flex-col gap-6 text-center md:flex-row md:items-center md:justify-between md:text-left">
      <div className="space-y-3">
        <div className="text-primary font-mono text-xs tracking-[0.32em] uppercase">
          Ready to deploy
        </div>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Build your next-generation credit stack with hedge.wtf.
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed">
          Access production-ready infrastructure, partner integrations, and comprehensive support to
          launch with confidence.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" variant="secondary">
          <Link href="/portfolio">Explore dashboard</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="mailto:bd@hedge.wtf">
            Talk to us
            <Users className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  </motion.section>
)

type FeatureCardProps = {
  feature: Feature
}

type SectionHeadingProps = {
  description?: string
  eyebrow: string
  title: string
}

const FeatureCard = ({ feature }: FeatureCardProps) => (
  <motion.div
    animate={{ y: 0 }}
    className="group border-foreground/20 bg-card/80 hover:border-primary/40 hover:bg-card/90 relative overflow-hidden rounded-xs border p-6 shadow-sm backdrop-blur transition-colors"
    transition={{ duration: 0.2, ease: "easeOut" }}
    variants={sectionVariants}
    whileHover={{ y: -4 }}
  >
    <feature.icon className="text-primary/90 size-10" />
    <h3 className="mt-4 text-xl font-semibold tracking-tight">{feature.title}</h3>
    <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{feature.description}</p>
  </motion.div>
)

const SectionHeading = ({ description, eyebrow, title }: SectionHeadingProps) => (
  <div className="max-w-2xl space-y-4">
    <span className="text-primary/70 font-mono text-xs font-bold tracking-[0.32em] uppercase">
      {eyebrow}
    </span>
    <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
    {description ? (
      <p className="text-muted-foreground text-base leading-relaxed">{description}</p>
    ) : null}
  </div>
)
