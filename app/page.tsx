import { Hero } from "@/components/sections/hero";
import { FeaturedProjects } from "@/components/sections/featured-projects";
import { TAISection } from "@/components/sections/tai-section";
import { About } from "@/components/sections/about";
import { Skills } from "@/components/sections/skills";
import { Services } from "@/components/sections/services";
import { Contact } from "@/components/sections/contact";

export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <main id="main">
      <Hero />
      <About />
      <TAISection />
      <FeaturedProjects />
      <Skills />
      <Services />
      <Contact />
    </main>
  );
}
