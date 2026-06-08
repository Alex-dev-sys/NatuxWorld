import { HeroSection } from '../components/HeroSection';
import { StatsCards } from '../components/StatsCards';
import { NewsSection } from '../components/NewsSection';
import { ServerInfo } from '../components/ServerInfo';

export function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <HeroSection />
      <StatsCards />
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <NewsSection />
        <ServerInfo />
      </div>
    </div>
  );
}
