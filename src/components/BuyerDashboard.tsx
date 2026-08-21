import { useMemo, useState } from "react";
import { ArrowUpRight, CarFront, Heart, MapPin, Search } from "lucide-react";

import { localizedCopy, type PluginCopy, type PluginLocale } from "../copy";
import type { VehicleListing } from "../types";

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
  const [brand, setBrand] = useState("");
  const [energy, setEnergy] = useState("");
  const [location, setLocation] = useState("");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const brands = useMemo(() => [...new Set(recommendations.map((listing) => listing.brand).filter((value): value is string => Boolean(value)))], [recommendations]);
  const energies = useMemo(() => [...new Set(recommendations.map((listing) => listing.energy).filter((value) => value && value !== "—"))], [recommendations]);
  const locations = useMemo(() => [...new Set(recommendations.map((listing) => listing.location).filter((value) => value && value !== "—"))], [recommendations]);
  const visible = useMemo(() => {
    const language = locale === "zh" ? "zh-CN" : "en";
    const normalized = query.trim().toLocaleLowerCase(language);
    return recommendations.filter((listing) => {
      if (brand && listing.brand !== brand) return false;
      if (energy && listing.energy !== energy) return false;
      if (location && listing.location !== location) return false;
      return !normalized || [listing.title, listing.subtitle, listing.brand, listing.model, listing.location, listing.energy, listing.year]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase(language)
        .includes(normalized);
    });
  }, [brand, energy, locale, location, query, recommendations]);

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
      <section className="auto-catalog-heading" aria-labelledby="auto-buyer-title">
        <div>
          <h1 id="auto-buyer-title">{text("buyerWorkspaceTitle", "精选车源", "Vehicles")}</h1>
          <p>{text("buyerWorkspaceDescription", "真实图片、车况和价格，直接挑选。", "Real photos, condition, and prices.")}</p>
        </div>
        <span>{locale === "en" ? `${visible.length} vehicles` : `${visible.length} 台车`}</span>
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
        <label className="auto-filter-field"><span>品牌</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">全部品牌</option>{brands.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="auto-filter-field"><span>能源</span><select value={energy} onChange={(event) => setEnergy(event.target.value)}><option value="">全部能源</option>{energies.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="auto-filter-field"><span>地区</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">全部地区</option>{locations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </section>

      {visible.length ? (
        <section className="auto-results" aria-labelledby="auto-results-title">
          <h2 id="auto-results-title" className="sr-only">{text("recommendationsEyebrow", "优先推荐", "Priority recommendations")}</h2>
          <div className="auto-vehicle-grid">
            {visible.map((listing) => (
              <article className="auto-vehicle-card" key={listing.id}>
                <button className="auto-vehicle-image" type="button" onClick={() => onOpenListing(listing)} aria-label={text("openListingLabel", `查看 ${listing.title}`, `View ${listing.title}`)}>
                  {listing.imageUrl ? <img src={listing.imageUrl} alt={listing.title} loading="lazy" decoding="async" /> : <span><CarFront size={30} aria-hidden="true" />{text("imagePendingLabel", "暂无图片", "No image")}</span>}
                </button>
                <div className="auto-vehicle-copy">
                  <div className="auto-vehicle-meta">
                    <span><MapPin size={13} aria-hidden="true" />{listing.location}</span>
                  </div>
                  <button className="auto-vehicle-title" type="button" onClick={() => onOpenListing(listing)}>
                    {listing.title}
                  </button>
                  {listing.subtitle ? <p>{listing.subtitle}</p> : null}
                  <span className="auto-vehicle-facts">{listing.year} · {listing.mileage} · {listing.energy}</span>
                </div>
                <div className="auto-vehicle-actions">
                  <strong>{listing.price}</strong>
                  <div>
                    <button
                      className={`auto-save-button${saved.has(listing.id) ? " is-saved" : ""}`}
                      type="button"
                      aria-label={saved.has(listing.id) ? text("removeSavedLabel", `取消收藏 ${listing.title}`, `Remove ${listing.title} from saved`) : text("saveListingLabel", `收藏 ${listing.title}`, `Save ${listing.title}`)}
                      aria-pressed={saved.has(listing.id)}
                      onClick={() => toggleSaved(listing)}
                    >
                      <Heart size={17} fill={saved.has(listing.id) ? "currentColor" : "none"} aria-hidden="true" />
                    </button>
                    <button className="auto-open-button" type="button" onClick={() => onOpenListing(listing)} aria-label={text("openListingLabel", `查看 ${listing.title}`, `View ${listing.title}`)}><ArrowUpRight size={17} aria-hidden="true" /></button>
                  </div>
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
