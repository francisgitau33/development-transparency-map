import Link from "next/link";
import { PublicLayout } from "@/components/public/PublicLayout";
import { Globe, MapPin, Users, BarChart3 } from "lucide-react";
import { BRANDING } from "@/lib/branding";
import { HeroMapBackground } from "@/components/home/HeroMapBackground";

export default function HomePage() {
  return (
    <PublicLayout>
      <section
        data-design-id="hero-section"
        className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden"
      >
        <div
          data-design-id="hero-background"
          className="absolute inset-0 bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900"
        />
        
        <HeroMapBackground />
        
        <div
          data-design-id="hero-content"
          className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        >
          <div
            data-design-id="hero-icon-container"
            className="inline-flex items-center justify-center w-20 h-20 bg-sky-500/20 rounded-2xl mb-8 backdrop-blur-sm"
          >
            <Globe data-design-id="hero-globe-icon" className="w-10 h-10 text-sky-400" />
          </div>
          
          <h1
            data-design-id="hero-title"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg"
          >
            {BRANDING.tagline}
          </h1>
          
          <p
            data-design-id="hero-subtitle"
            className="text-xl sm:text-2xl text-sky-300 mb-4 font-medium"
          >
            {BRANDING.subtitle}
          </p>
          
          <p
            data-design-id="hero-description"
            className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto"
          >
            {BRANDING.description}
          </p>
          
          <Link
            href="/map"
            data-design-id="hero-cta"
            className="inline-flex items-center px-8 py-4 bg-sky-500 hover:bg-sky-600 text-white text-lg font-semibold rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-sky-500/30"
          >
            <MapPin data-design-id="hero-cta-icon" className="w-5 h-5 mr-2" />
            Explore the Map
          </Link>
        </div>
      </section>

      <section
        data-design-id="features-section"
        className="py-20 bg-white"
      >
        <div
          data-design-id="features-container"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div
            data-design-id="features-header"
            className="text-center mb-16"
          >
            <h2
              data-design-id="features-title"
              className="text-3xl font-bold text-slate-900 mb-4"
            >
              Transparency Through Data
            </h2>
            <p
              data-design-id="features-subtitle"
              className="text-lg text-slate-600 max-w-2xl mx-auto"
            >
              Empowering stakeholders with accessible, accurate information about development initiatives worldwide.
            </p>
          </div>
          
          <div
            data-design-id="features-grid"
            className="grid md:grid-cols-3 gap-8"
          >
            <div
              data-design-id="feature-card-1"
              className="bg-sky-50 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow duration-300"
            >
              <div
                data-design-id="feature-card-1-icon"
                className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 rounded-xl mb-6"
              >
                <MapPin data-design-id="feature-1-mappin-icon" className="w-7 h-7 text-sky-600" />
              </div>
              <h3
                data-design-id="feature-card-1-title"
                className="text-xl font-semibold text-slate-900 mb-3"
              >
                Geospatial Mapping
              </h3>
              <p
                data-design-id="feature-card-1-description"
                className="text-slate-600"
              >
                Visualize development projects on an interactive map with precise location data and filtering capabilities.
              </p>
            </div>
            
            <div
              data-design-id="feature-card-2"
              className="bg-sky-50 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow duration-300"
            >
              <div
                data-design-id="feature-card-2-icon"
                className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 rounded-xl mb-6"
              >
                <Users data-design-id="feature-2-users-icon" className="w-7 h-7 text-sky-600" />
              </div>
              <h3
                data-design-id="feature-card-2-title"
                className="text-xl font-semibold text-slate-900 mb-3"
              >
                Partner Contributions
              </h3>
              <p
                data-design-id="feature-card-2-description"
                className="text-slate-600"
              >
                Enable approved organizations to contribute and manage their project data through a secure dashboard.
              </p>
            </div>
            
            <div
              data-design-id="feature-card-3"
              className="bg-sky-50 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow duration-300"
            >
              <div
                data-design-id="feature-card-3-icon"
                className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 rounded-xl mb-6"
              >
                <BarChart3 data-design-id="feature-3-chart-icon" className="w-7 h-7 text-sky-600" />
              </div>
              <h3
                data-design-id="feature-card-3-title"
                className="text-xl font-semibold text-slate-900 mb-3"
              >
                Data-Driven Insights
              </h3>
              <p
                data-design-id="feature-card-3-description"
                className="text-slate-600"
              >
                Access comprehensive analytics and reports to understand development trends and impact.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer
        data-design-id="footer"
        className="bg-slate-900 text-white py-12"
      >
        <div
          data-design-id="footer-container"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        >
          <div
            data-design-id="footer-logo"
            className="inline-flex items-center justify-center w-12 h-12 bg-sky-500/20 rounded-xl mb-4"
          >
            <Globe data-design-id="footer-globe-icon" className="w-6 h-6 text-sky-400" />
          </div>
          <p
            data-design-id="footer-brand"
            className="text-lg font-semibold mb-2"
          >
            {BRANDING.productName}
          </p>
          <p
            data-design-id="footer-tagline"
            className="text-slate-400"
          >
            {BRANDING.tagline}
          </p>
        </div>
      </footer>
    </PublicLayout>
  );
}
