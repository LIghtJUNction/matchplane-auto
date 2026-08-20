import { useMemo, useState } from "react";
import { Heart, MapPin, Search, Sparkles } from "lucide-react";

import { localizedCopy, type PluginCopy, type PluginLocale } from "../copy";
import type { VehicleListing } from "../types";
import { VehicleVisual } from "./Primitives";

interface BuyerDashboardProps {
  onOpenListing: (listing: VehicleListing) => void;
  onNotice: (message: string) => void;
  recommendations?: VehicleListing[];
  locale?: PluginLocale;
  copy?: PluginCopy;
}

/** A compact child-owned result surface; the root still owns chat and contact release. */
export function BuyerDashboard({ onOpenListing, onNotice, recommendations = [], locale = "zh", copy }: BuyerDashboardProps) {
  const text = (key: string, fallbackZh: string, fallbackEn = fallbackZh) => localizedCopy(locale, copy, key, fallbackZh, fallbackEn);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const visible = useMemo(() => {
    const language = locale === "zh" ? "zh-CN" : "en";
    const normalized = query.trim().toLocaleLowerCase(language);
    if (!normalized) return recommendations;
    return recommendations.filter((listing) =>
      [listing.title, listing.subtitle, listing.location, listing.energy, listing.year]
        .join(" ")
        .toLocaleLowerCase(language)
        .includes(normalized),
    );
  }, [locale, query, recommendations]);

  const toggleSaved = (listing: VehicleListing) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(listing.id)) {
        next.delete(listing.id);
        onNotice(text("listingUnsavedNotice", "已取消收藏", "Removed from saved"));
      } else {
        next.add(listing.id);
        onNotice(text("listingSavedNotice", "已收藏，稍后可在根平台继续处理", "Saved; continue from the root platform later"));
      }
      return next;
    });
  };

  return (
    <div className="dashboard buyer-dashboard auto-buyer-workbench">
      <section className="auto-workbench-intro" aria-labelledby="auto-buyer-title">
        <p className="eyebrow">{text("buyerEyebrow", "二手车撮合", "Used-car matching")}</p>
        <h1 id="auto-buyer-title">{text("buyerWorkspaceTitle", "从真实车源里，找到合适的一台。", "Find the right car from real offers.")}</h1>
        <p>{text("buyerWorkspaceDescription", "结果来自当前需求的真实匹配。打开一条车源即可查看理由并申请联系。", "These results come from the current matching request. Open an offer to review the reasons and request contact.")}</p>
      </section>

      <section className="auto-results-toolbar" aria-label={text("searchOffersLabel", "搜索车源", "Search offers")}>
        <label className="auto-search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{text("searchOffersLabel", "搜索车源", "Search offers")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("searchOffersPlaceholder", "搜索品牌、能源类型、年份或城市", "Search brand, energy, year, or city")}
            type="search"
          />
        </label>
        <span>{locale === "en" ? `${visible.length} results` : `${visible.length} 条结果`}</span>
      </section>

      {visible.length ? (
        <section className="auto-results" aria-labelledby="auto-results-title">
          <h2 id="auto-results-title" className="sr-only">{text("recommendationsEyebrow", "优先推荐", "Priority recommendations")}</h2>
          <div className="auto-vehicle-list">
            {visible.map((listing) => (
              <article className="auto-vehicle-card" key={listing.id}>
                <div className="auto-vehicle-visual"><VehicleVisual accent={listing.accent} compact /></div>
                <div className="auto-vehicle-copy">
                  <div className="auto-vehicle-meta">
                    <span>{listing.matchScore}% {text("matchLabel", "匹配", "match")}</span>
                    <span><MapPin size={13} aria-hidden="true" />{listing.location}</span>
                  </div>
                  <button className="auto-vehicle-title" type="button" onClick={() => onOpenListing(listing)}>
                    {listing.title}
                  </button>
                  <p>{listing.subtitle}</p>
                  <span className="auto-vehicle-facts">{listing.year} · {listing.mileage} · {listing.energy}</span>
                  <span className="auto-vehicle-reason"><Sparkles size={14} aria-hidden="true" />{listing.reasons[0]}</span>
                </div>
                <div className="auto-vehicle-actions">
                  <strong>{listing.price}</strong>
                  <button
                    className={`auto-save-button${saved.has(listing.id) ? " is-saved" : ""}`}
                    type="button"
                    aria-label={saved.has(listing.id) ? text("removeSavedLabel", `取消收藏 ${listing.title}`, `Remove ${listing.title} from saved`) : text("saveListingLabel", `收藏 ${listing.title}`, `Save ${listing.title}`)}
                    aria-pressed={saved.has(listing.id)}
                    onClick={() => toggleSaved(listing)}
                  >
                    <Heart size={18} fill={saved.has(listing.id) ? "currentColor" : "none"} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="auto-empty-state" aria-live="polite">
          <Search size={25} aria-hidden="true" />
          <h2>{query ? text("noSearchResultsTitle", "没有匹配这次搜索的车源", "No offers match this search") : text("noOffersTitle", "等待真实车源进入匹配", "Waiting for real offers")}</h2>
          <p>{query ? text("noSearchResultsDescription", "换一个品牌、能源类型或城市试试。", "Try another brand, energy type, or city.") : text("noOffersDescription", "平台不会虚构库存；审核通过的车源会出现在这里。", "The platform never invents inventory; approved offers will appear here.")}</p>
          {query ? <button type="button" onClick={() => setQuery("")}>{text("clearSearchLabel", "清除搜索", "Clear search")}</button> : null}
        </section>
      )}
    </div>
  );
}
