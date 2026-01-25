import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Mic, FileText, Clock, Shield, Stethoscope, Sparkles, Check, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
                <Stethoscope className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">DocuWhisper</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</a>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" asChild data-testid="button-login">
                <a href="/api/login">Log In</a>
              </Button>
              <Button asChild data-testid="button-get-started">
                <a href="/api/login">Get Started</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/20 rounded-full blur-3xl" />
          </div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/50 text-accent-foreground text-sm font-medium mb-6">
                <Sparkles className="h-4 w-4" />
                <span>AI-Powered Medical Scribing</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
                Focus on patients,{" "}
                <span className="text-primary">not paperwork</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                DocuWhisper transforms your patient consultations into structured SOAP notes in seconds. 
                Spend less time on documentation and more time providing quality care.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" className="text-base px-8" asChild data-testid="button-hero-get-started">
                  <a href="/api/login">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" asChild data-testid="button-hero-demo">
                  <a href="#features">See How It Works</a>
                </Button>
              </div>
              <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>No credit card required</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 md:py-28 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need for clinical documentation</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Our AI-powered platform streamlines your workflow so you can deliver better patient care.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-voice">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Mic className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Voice Recording</h3>
                  <p className="text-muted-foreground">
                    Simply speak naturally during your consultation. Our AI captures and transcribes every detail with high accuracy.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-soap">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">SOAP Note Generation</h3>
                  <p className="text-muted-foreground">
                    Automatically structure your notes into Subjective, Objective, Assessment, and Plan sections.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-time">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Save 2+ Hours Daily</h3>
                  <p className="text-muted-foreground">
                    Reduce documentation time by up to 80%. No more late nights catching up on charting.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-security">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">HIPAA Compliant</h3>
                  <p className="text-muted-foreground">
                    Your patient data is encrypted and secure. We follow the highest standards for healthcare data protection.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-specialty">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Stethoscope className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Any Specialty</h3>
                  <p className="text-muted-foreground">
                    Customized templates for primary care, cardiology, pediatrics, psychiatry, and more.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md hover-elevate" data-testid="card-feature-ai">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">AI That Learns</h3>
                  <p className="text-muted-foreground">
                    The more you use DocuWhisper, the better it adapts to your documentation style and preferences.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20 md:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                One plan, everything included. No hidden fees, no surprises.
              </p>
            </div>
            <div className="max-w-md mx-auto">
              <Card className="border-2 border-primary shadow-xl relative overflow-hidden" data-testid="card-pricing">
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-lg">
                  MOST POPULAR
                </div>
                <CardContent className="pt-8 pb-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold mb-2">Professional</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-bold">$25</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">Billed monthly. Cancel anytime.</p>
                  </div>
                  <ul className="space-y-3 mb-8">
                    {[
                      "Unlimited voice recordings",
                      "Unlimited SOAP notes",
                      "All specialty templates",
                      "Priority AI processing",
                      "Export to PDF/Word",
                      "Secure cloud storage",
                      "Email support"
                    ].map((feature, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" size="lg" asChild data-testid="button-pricing-subscribe">
                    <a href="/api/login">Start 14-Day Free Trial</a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 md:py-28 bg-sidebar text-sidebar-foreground">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to transform your practice?</h2>
              <p className="text-lg text-sidebar-foreground/70 mb-8">
                Join thousands of healthcare providers who have reclaimed their time with DocuWhisper.
              </p>
              <Button size="lg" className="text-base px-8 bg-primary text-primary-foreground hover:bg-primary/90" asChild data-testid="button-cta-get-started">
                <a href="/api/login">
                  Get Started for Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <Stethoscope className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">DocuWhisper</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} DocuWhisper. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
