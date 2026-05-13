import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppleMark } from "@/components/apple-mark";
import { Mic, FileText, Clock, Shield, Sparkles, Check, ArrowRight, Stethoscope, X, Zap, Users, Globe, AlertTriangle, Brain, Smartphone } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { capture } from "@/lib/analytics";

export default function Landing() {
  useEffect(() => {
    capture("landing_view");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="DocuWhisper" className="h-9 w-9 rounded-md" />
              <span className="text-xl font-semibold tracking-tight">DocuWhisper</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</a>
              <a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-security">Security</a>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" asChild data-testid="button-login">
                <a href="/api/login" onClick={() => capture("landing_login_click", { location: "nav" })}>Log In</a>
              </Button>
              <Button asChild data-testid="button-get-started">
                <a href="/api/login?mode=signup" onClick={() => capture("landing_cta_click", { location: "nav" })}>Get Started</a>
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
                  <a href="/api/login?mode=signup" onClick={() => capture("landing_cta_click", { location: "hero" })}>
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" asChild data-testid="button-hero-demo">
                  <a href="#features" onClick={() => capture("landing_demo_click")}>See How It Works</a>
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
              <div className="mt-8 mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card/70 p-5 text-left shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      <Smartphone className="h-4 w-4" />
                      <span>DocuWhisper Mobile</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Take DocuWhisper with you on iPhone and iPad. Capture visits, review notes, and resume charts from the companion app.
                    </p>
                  </div>
                  <Button variant="outline" asChild data-testid="button-app-store">
                    <a
                      href="https://apps.apple.com/us/app/docuwhispermobile/id6759997507"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <AppleMark className="mr-2 h-4 w-4" />
                      Download on the App Store
                    </a>
                  </Button>
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

        {/* Why Choose DocuWhisper - Competitive Advantages */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why Healthcare Providers Choose DocuWhisper</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                See how we compare to other medical scribing solutions
              </p>
            </div>

            {/* Comparison Table */}
            <div className="max-w-4xl mx-auto mb-16 overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="font-semibold text-lg">Feature</div>
                  <div className="text-center font-semibold text-lg text-primary">DocuWhisper</div>
                  <div className="text-center font-semibold text-muted-foreground">Heidi Health</div>
                  <div className="text-center font-semibold text-muted-foreground">Nuance DAX</div>
                </div>
                
                {[
                  { feature: "Drug Interaction Alerts", us: true, heidi: false, nuance: false },
                  { feature: "Medical Autocomplete", us: true, heidi: false, nuance: false },
                  { feature: "Real-time Team Co-editing", us: true, heidi: false, nuance: false },
                  { feature: "ICD-10 & CPT Suggestions", us: true, heidi: true, nuance: true },
                  { feature: "Multi-language Support", us: true, heidi: true, nuance: false },
                  { feature: "Custom SOAP Templates", us: true, heidi: true, nuance: false },
                  { feature: "Practice/Team Management", us: true, heidi: false, nuance: true },
                  { feature: "Task Management", us: true, heidi: false, nuance: false },
                  { feature: "Analytics Dashboard", us: true, heidi: false, nuance: true },
                  { feature: "Starting Price", us: "$59/mo or $590/yr", heidi: "$99/mo", nuance: "Enterprise" },
                ].map((row, i) => (
                  <div key={i} className={`grid grid-cols-4 gap-4 py-3 ${i % 2 === 0 ? 'bg-muted/30' : ''} rounded-lg px-2`}>
                    <div className="font-medium">{row.feature}</div>
                    <div className="text-center">
                      {typeof row.us === 'boolean' ? (
                        row.us ? <Check className="h-5 w-5 text-primary mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="font-semibold text-primary">{row.us}</span>
                      )}
                    </div>
                    <div className="text-center">
                      {typeof row.heidi === 'boolean' ? (
                        row.heidi ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">{row.heidi}</span>
                      )}
                    </div>
                    <div className="text-center">
                      {typeof row.nuance === 'boolean' ? (
                        row.nuance ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">{row.nuance}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Differentiators */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-safety">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Drug Interaction Alerts</h3>
                  <p className="text-muted-foreground mb-3">
                    <span className="font-semibold text-primary">Only DocuWhisper</span> automatically detects and warns about potential drug-drug interactions with severity levels.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Catch dangerous combinations like warfarin + aspirin before they become patient safety issues.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-autocomplete">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center mb-4">
                    <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Medical Terminology AI</h3>
                  <p className="text-muted-foreground mb-3">
                    <span className="font-semibold text-primary">Only DocuWhisper</span> provides intelligent autocomplete for 200+ medical terms as you type.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Symptoms, diagnoses, medications, procedures - all at your fingertips for faster, more accurate documentation.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-collab">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Real-time Team Collaboration</h3>
                  <p className="text-muted-foreground mb-3">
                    <span className="font-semibold text-primary">Only DocuWhisper</span> lets your team co-edit notes simultaneously with live presence indicators.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Perfect for teaching hospitals, group practices, and care coordination teams.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-price">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center mb-4">
                    <Zap className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Competitive Solo Pricing</h3>
                  <p className="text-muted-foreground mb-3">
                    At <span className="font-semibold text-primary">$59/month</span> or <span className="font-semibold text-primary">$590/year</span>, DocuWhisper stays affordable for solo clinicians while still including the full documentation workflow.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Priced to stay sustainable without stripping out the features independent practices actually use.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-languages">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center mb-4">
                    <Globe className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">5 Languages Built-in</h3>
                  <p className="text-muted-foreground mb-3">
                    Transcribe and generate notes in English, Spanish, French, German, and Portuguese.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Serve diverse patient populations without switching tools or paying extra.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 border-primary/20 shadow-lg" data-testid="card-advantage-complete">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center mb-4">
                    <Sparkles className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Complete Clinical Suite</h3>
                  <p className="text-muted-foreground mb-3">
                    Referral letters, patient summaries, billing codes, task management, and analytics - all included.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Everything you need to run an efficient practice, not just transcription.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20 md:py-28 bg-muted/30">
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
                    <h3 className="text-2xl font-bold mb-2">Solo</h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-bold">$59</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">$590/year if you prefer annual billing. Cancel anytime.</p>
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
                    <a href="/api/login?mode=signup" onClick={() => capture("landing_cta_click", { location: "pricing" })}>Start 14-Day Free Trial</a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="security" className="py-20 md:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">Security & Privacy</h2>
                <p className="text-lg text-muted-foreground">
                  We take the security of your data seriously
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <Card className="border shadow-sm">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">Data Protection</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>All data encrypted in transit (TLS/HTTPS)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>AES-256 encryption for data at rest</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>Secure OAuth authentication</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>User-isolated data access</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
                
                <Card className="border shadow-sm">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">Audio Processing</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>Audio processed in-memory only</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>No permanent audio file storage</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>Transcripts stored securely in database</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>SOC 2 Type 2 certified infrastructure</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
              
              <Card className="border-border bg-muted/30">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-2">A documentation assistant, not your EHR</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    DocuWhisper turns your patient consultations into structured SOAP notes. Your patient records still live in your existing EHR or chart system.
                    We implement industry-standard security: TLS in transit, AES-256 at rest, audio processed in memory only (no permanent audio storage), per-user data isolation,
                    comprehensive audit logging, and SOC 2 Type 2 infrastructure. As with any clinical tool, evaluate fit for your specific compliance requirements
                    before adopting it in your practice.
                  </p>
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
                <a href="/api/login?mode=signup" onClick={() => capture("landing_cta_click", { location: "footer_cta" })}>
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img src={logoImage} alt="DocuWhisper" className="h-7 w-7 rounded-md" />
                <span className="font-semibold">DocuWhisper</span>
              </div>
              <nav className="flex items-center gap-4">
                <a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-security">Security</a>
                <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</a>
                <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a>
                <a href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms</a>
                <a href="/account-deletion" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-account-deletion">Account Deletion</a>
                <a href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-support">Support</a>
              </nav>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} DocuWhisper. All rights reserved. Not a certified EHR system.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
