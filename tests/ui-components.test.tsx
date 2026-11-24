import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrecisionBadge, SyncStatusBadge } from "../src/components/ui/badge.tsx";
import { MetricCard } from "../src/components/ui/metric-card.tsx";
import { DailyPostsChart } from "../src/components/charts/daily-posts-chart.tsx";
import { ObservedGrowthChart } from "../src/components/charts/observed-growth-chart.tsx";
import { Navigation } from "../src/components/ui/navigation.tsx";

describe("Dashboard UI Component Rendering", () => {
  describe("PrecisionBadge", () => {
    it("renders EXACT precision badge with emerald styling", () => {
      const html = renderToStaticMarkup(<PrecisionBadge precision="EXACT" />);
      expect(html).toContain("EXACT");
      expect(html).toContain("text-emerald-600");
    });

    it("renders ROUNDED precision badge with amber styling", () => {
      const html = renderToStaticMarkup(<PrecisionBadge precision="ROUNDED" />);
      expect(html).toContain("ROUNDED");
      expect(html).toContain("text-amber-600");
    });

    it("renders UNAVAILABLE precision badge with zinc styling", () => {
      const html = renderToStaticMarkup(<PrecisionBadge precision="UNAVAILABLE" />);
      expect(html).toContain("UNAVAILABLE");
      expect(html).toContain("text-zinc-500");
    });
  });

  describe("SyncStatusBadge", () => {
    it("renders SUCCESS status badge", () => {
      const html = renderToStaticMarkup(<SyncStatusBadge status="SUCCESS" />);
      expect(html).toContain("Synced");
      expect(html).toContain("bg-emerald-500");
    });

    it("renders RUNNING status badge", () => {
      const html = renderToStaticMarkup(<SyncStatusBadge status="RUNNING" />);
      expect(html).toContain("Syncing");
      expect(html).toContain("bg-blue-500");
    });

    it("renders FAILED status badge", () => {
      const html = renderToStaticMarkup(<SyncStatusBadge status="FAILED" />);
      expect(html).toContain("Failed");
      expect(html).toContain("bg-rose-500");
    });
  });

  describe("MetricCard", () => {
    it("renders title, formatted value, and precision badge", () => {
      const html = renderToStaticMarkup(
        <MetricCard
          title="Lifetime Views"
          value="878"
          subtitle="Exact lifetime sum"
          precision="EXACT"
        />
      );
      expect(html).toContain("Lifetime Views");
      expect(html).toContain("878");
      expect(html).toContain("Exact lifetime sum");
      expect(html).toContain("EXACT");
    });

    it("renders unavailable reason when metric is unavailable", () => {
      const html = renderToStaticMarkup(
        <MetricCard
          title="Reach"
          value="Unavailable"
          precision="UNAVAILABLE"
          unavailableReason="Reach is unavailable on Telegram broadcast channels"
        />
      );
      expect(html).toContain("Reach");
      expect(html).toContain("Unavailable");
      expect(html).toContain("Reach is unavailable on Telegram broadcast channels");
    });

    it("renders breakdown trigger when breakdown items are supplied", () => {
      const html = renderToStaticMarkup(
        <MetricCard
          title="Test Metric"
          value="100"
          breakdown={[
            { label: "Item A", count: 80 },
            { label: "Item B", count: 20 },
          ]}
        />
      );
      expect(html).toContain("View count breakdown");
    });
  });

  describe("DailyPostsChart", () => {
    it("renders empty state notice when data is empty", () => {
      const html = renderToStaticMarkup(<DailyPostsChart data={[]} total={0} />);
      expect(html).toContain("No publication data available");
    });

    it("renders SVG chart with daily bars and total count", () => {
      const sampleDaily = [
        { date: "2026-11-20", count: 7 },
        { date: "2026-11-21", count: 0 },
        { date: "2026-11-22", count: 3 },
      ];
      const html = renderToStaticMarkup(<DailyPostsChart data={sampleDaily} total={10} />);
      expect(html).toContain("Posts Published by Day");
      expect(html).toContain("10"); // Period total
      expect(html).toContain("<svg");
      expect(html).toContain("11-20");
    });
  });

  describe("ObservedGrowthChart", () => {
    it("renders growth label, coverage stats, and daily growth bars", () => {
      const sampleDaily = [
        { date: "2026-11-20", observedGrowth: null, reason: "Baseline establishment only" },
        { date: "2026-11-21", observedGrowth: 85, isExact: true },
        { date: "2026-11-22", observedGrowth: 60, isExact: true },
      ];
      const sampleCoverage = {
        totalPosts: 7,
        eligiblePostsCount: 4,
        excludedNoBaseline: 2,
        excludedNoSubsequentObservation: 0,
        excludedRoundedOrUnavailable: 1,
        excludedNegativeDelta: 0,
      };

      const html = renderToStaticMarkup(
        <ObservedGrowthChart
          daily={sampleDaily}
          totalGrowth={145}
          isExact={true}
          label="Observed change between observations"
          description="Calculated strictly between exact observations"
          coverage={sampleCoverage}
        />
      );

      expect(html).toContain("Observed change between observations");
      expect(html).toContain("+145");
      expect(html).toContain("Eligible posts");
      expect(html).toContain("4");
    });

    it("renders Unavailable when total growth is null", () => {
      const sampleCoverage = {
        totalPosts: 7,
        eligiblePostsCount: 0,
        excludedNoBaseline: 7,
        excludedNoSubsequentObservation: 0,
        excludedRoundedOrUnavailable: 0,
        excludedNegativeDelta: 0,
      };

      const html = renderToStaticMarkup(
        <ObservedGrowthChart
          daily={[]}
          totalGrowth={null}
          isExact={false}
          label="Observed change between observations"
          description="Description test"
          coverage={sampleCoverage}
        />
      );

      expect(html).toContain("Unavailable");
    });
  });

  describe("Navigation Range Presets Availability", () => {
    it("renders available presets enabled and unavailable presets disabled with tooltip", () => {
      const channels = [
        {
          id: "ch-1",
          telegramUsername: "testchannel",
          title: "Test Channel",
          timezone: "Africa/Addis_Ababa",
          postsCount: 10,
        },
      ];

      const rangeAvailability = {
        "1d": { isAvailable: true },
        "5d": { isAvailable: true },
        "7d": { isAvailable: true },
        "15d": { isAvailable: false, reason: "Available after 15 days of recorded history." },
        "30d": { isAvailable: false, reason: "Available after 30 days of recorded history." },
        "60d": { isAvailable: false, reason: "Available after 60 days of recorded history." },
      };

      const html = renderToStaticMarkup(
        <Navigation
          channels={channels}
          selectedChannelId="ch-1"
          onSelectChannel={() => {}}
          selectedRange="7d"
          onSelectRange={() => {}}
          rangeAvailability={rangeAvailability}
          onLogout={() => {}}
        />
      );

      // 7D is active
      expect(html).toContain("7D");
      // 15D, 30D, 60D have title reason tooltips and disabled attribute
      expect(html).toContain('title="Available after 15 days of recorded history."');
      expect(html).toContain('title="Available after 30 days of recorded history."');
      expect(html).toContain('title="Available after 60 days of recorded history."');
      expect(html).toContain("disabled");
      expect(html).toContain("cursor-not-allowed");
    });
  });
});
