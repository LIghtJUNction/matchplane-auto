import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Heart,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { motion } from "motion/react";

import type { VehicleListing } from "../types";
import { localizedCopy, type PluginCopy, type PluginLocale } from "../copy";
import { SectionHeading, VehicleVisual, spring } from "./Primitives";

interface BuyerDashboardProps {
  onOpenListing: (listing: VehicleListing) => void;
  onNotice: (message: string) => void;
  recommendations?: VehicleListing[];
  locale?: PluginLocale;
  copy?: PluginCopy;
}

export function BuyerDashboard({ onOpenListing, onNotice, recommendations = [], filters = [], locale = "zh", copy }: BuyerDashboardProps & { filters?: string[] }) {
  const text = (key: string, fallbackZh: string, fallbackEn = fallbackZh) => localizedCopy(locale, copy, key, fallbackZh, fallbackEn);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return recommendations;
    return recommendations.filter((listing) =>
      [listing.title, listing.subtitle, listing.location, listing.energy]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
  }, [query, recommendations]);

  const toggleSaved = (id: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToRecommendations = () => {
    document.getElementById("recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="dashboard buyer-dashboard">
      <section className="buyer-hero" aria-labelledby="buyer-hero-title">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles size={16} aria-hidden="true" />
            {text("buyerHeroKicker", "需求由买家定义", "Your need comes first")}
          </span>
          <h1 id="buyer-hero-title">
            {text("buyerHeroTitle", "适合你的车，", "A better fit")}
            <span>{text("buyerHeroTitleAccent", "不只是看起来相似。", "is more than looking similar.")}</span>
          </h1>
          <p>
            {text("buyerHeroDescription", "告诉我们真实用途、预算和不能妥协的条件。平台会解释每一次推荐，撮合后你可以直接联系供给方、预约线下协商。", "Share your use case, budget, and non-negotiables. The platform explains every recommendation, then helps you contact the supply side and arrange the next step.")}
          </p>
          <div className="hero-actions">
            <motion.button
              className="button button-dark"
              type="button"
              onClick={scrollToRecommendations}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              {text("viewRecommendationsLabel", "查看推荐", "See recommendations")}
              <ArrowRight size={18} aria-hidden="true" />
            </motion.button>
            <motion.button
              className="button button-quiet"
              type="button"
              onClick={() => onNotice(text("adjustNeedNotice", "需求编辑器已保存你的当前筛选条件", "Your current need filters are saved"))}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              {text("adjustNeedLabel", "调整需求", "Adjust need")}
            </motion.button>
          </div>
          <div className="hero-proof" aria-label={text("buyerProofLabel", "平台保障", "Platform safeguards")}>
            <span><ShieldCheck size={16} aria-hidden="true" /> {text("controlledContactLabel", "联系方式受控解锁", "Contact is unlocked with consent")}</span>
            <span><BadgeCheck size={16} aria-hidden="true" /> {text("explainableMatchLabel", "匹配理由可解释", "Recommendations are explainable")}</span>
          </div>
        </div>
        <motion.div
          className="hero-art-wrap"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <img
            src="/matchplane-marketplace-art.png"
            alt={text("buyerHeroImageAlt", "买卖双方建立可信连接", "Buyers and sellers building a trusted connection")}
          />
          <div className="floating-match-card">
            <span>{text("matchReasonLabel", "匹配理由", "Why it matches")}</span>
            <strong>AI</strong>
            <small>{text("matchReasonInputs", "预算 · 用途 · 车况", "Budget · use · condition")}</small>
          </div>
        </motion.div>
      </section>

      <section className="discovery-panel" aria-label={text("discoveryLabel", "找车条件", "Search criteria")}>
        <label className="search-field">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">{text("searchOffersLabel", "搜索车源", "Search offers")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("searchOffersPlaceholder", "搜索品牌、能源类型或城市", "Search brand, energy type, or city")}
            type="search"
          />
        </label>
        <button className="filter-button" type="button" onClick={() => onNotice(text("filtersOpenedNotice", "高级筛选已展开", "Advanced filters opened"))}>
          <SlidersHorizontal size={18} aria-hidden="true" />
          {text("filterLabel", "筛选", "Filter")}
        </button>
        <div className="filter-chips" aria-label={text("activeFiltersLabel", "当前筛选条件", "Active filters")}>
          {filters.map((filter) => (
            <button key={filter} type="button" onClick={() => onNotice(`${text("selectedFilterNotice", "已选条件", "Selected")}: ${filter}`)}>
              {filter}
              <Check size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section id="recommendations" className="content-section">
        <SectionHeading
          eyebrow={text("recommendationsEyebrow", "为你排序，而不是竞价排序", "Ranked for you, not by bidding")}
          title={locale === "en" ? `${visible.length} priority recommendations` : `${visible.length} 台优先推荐`}
        />
        {visible.length ? (
          <div className="vehicle-grid">
            {visible.map((listing, index) => (
              <VehicleCard
                key={listing.id}
                listing={listing}
                index={index}
                saved={saved.has(listing.id)}
                onSave={() => toggleSaved(listing.id)}
                onOpen={() => onOpenListing(listing)}
                locale={locale}
                copy={copy}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={28} aria-hidden="true" />
            <h3>{query ? text("noSearchResultsTitle", "没有命中这次搜索", "No offers match this search") : text("noOffersTitle", "等待供给方上传资料", "Waiting for supply")}</h3>
            <p>{query ? text("noSearchResultsDescription", "保留你的硬性条件，换一个品牌或城市试试。", "Keep your must-haves and try another brand or city.") : text("noOffersDescription", "平台不预置车源，审核通过的真实资料会出现在这里。", "The platform does not invent inventory; approved offers appear here.")}</p>
            {query ? <button type="button" onClick={() => setQuery("")}>{text("clearSearchLabel", "清除搜索", "Clear search")}</button> : null}
          </div>
        )}
      </section>

      <section className="offline-section" aria-labelledby="offline-title">
        <div className="offline-intro">
          <span className="eyebrow">{text("offlineEyebrow", "线上撮合 · 线下协商", "Online matching · offline follow-up")}</span>
          <h2 id="offline-title">{text("offlineTitle", "下一步在哪里进行，由双方决定。", "Both sides decide where to continue.")}</h2>
          <p>
            {text("offlineDescription", "平台确认双方匹配与服务费安排后，才按权限交换联系方式。线下交易仍保留撮合记录，平台只收取事先披露的撮合提成。", "Contact details are exchanged only after the match and fee arrangement are confirmed. Offline follow-up stays in the matching record, with only the disclosed platform fee due.")}
          </p>
        </div>
        <ol className="offline-steps">
          <li>
            <span><UserRoundCheck aria-hidden="true" /></span>
            <div><small>01</small><strong>{text("offlineStepOneTitle", "匹配并解锁联系", "Match and unlock contact")}</strong><p>{text("offlineStepOneDescription", "仅双方可见，访问留有审计记录。", "Visible only to both sides, with access recorded.")}</p></div>
          </li>
          <li>
            <span><CalendarDays aria-hidden="true" /></span>
            <div><small>02</small><strong>{text("offlineStepTwoTitle", "预约线下协商", "Arrange the next step")}</strong><p>{text("offlineStepTwoDescription", "地点和时间由双方确认后生效。", "Place and time take effect after both sides confirm.")}</p></div>
          </li>
          <li>
            <span><BadgeCheck aria-hidden="true" /></span>
            <div><small>03</small><strong>{text("offlineStepThreeTitle", "双方确认结果", "Confirm the outcome")}</strong><p>{text("offlineStepThreeDescription", "完成后按披露规则结算并更新供给状态。", "After completion, settle the disclosed fee and update the offer state.")}</p></div>
          </li>
        </ol>
      </section>
    </div>
  );
}

function VehicleCard({
  listing,
  index,
  saved,
  onSave,
  onOpen,
  locale,
  copy,
}: {
  listing: VehicleListing;
  index: number;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  locale: PluginLocale;
  copy?: PluginCopy;
}) {
  const text = (key: string, fallbackZh: string, fallbackEn = fallbackZh) => localizedCopy(locale, copy, key, fallbackZh, fallbackEn);
  return (
    <motion.article
      className="vehicle-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.045 }}
      layout
    >
      <button className="vehicle-open" type="button" onClick={onOpen} aria-label={locale === "en" ? `View ${listing.title}` : `查看 ${listing.title}`}>
        <VehicleVisual accent={listing.accent} />
      </button>
      <motion.button
        type="button"
        className={`save-button${saved ? " is-saved" : ""}`}
        onClick={onSave}
        aria-label={saved ? (locale === "en" ? `Remove ${listing.title} from saved` : `取消收藏 ${listing.title}`) : (locale === "en" ? `Save ${listing.title}` : `收藏 ${listing.title}`)}
        aria-pressed={saved}
        whileTap={{ scale: 0.86 }}
        transition={spring}
      >
        <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </motion.button>
      <div className="vehicle-content">
        <div className="match-row">
          <span className="match-score">{listing.matchScore}% {text("matchLabel", "匹配", "match")}</span>
          <span><MapPin size={14} aria-hidden="true" /> {listing.location}</span>
        </div>
        <button className="vehicle-title-button" type="button" onClick={onOpen}>
          <h3>{listing.title}</h3>
        </button>
        <p className="vehicle-subtitle">{listing.subtitle}</p>
        <dl className="vehicle-facts">
          <div><dt>{text("mileageLabel", "里程", "Mileage")}</dt><dd>{listing.mileage}</dd></div>
          <div><dt>{text("energyLabel", "能源", "Energy")}</dt><dd>{listing.energy}</dd></div>
          <div><dt>{text("yearLabel", "年份", "Year")}</dt><dd>{listing.year}</dd></div>
        </dl>
        <div className="reason-line">
          <Sparkles size={15} aria-hidden="true" />
          <span>{listing.reasons[0]}</span>
        </div>
        <div className="price-row">
          <div><strong>{listing.price}</strong><small>{listing.monthly}</small></div>
          <motion.button
            className="round-arrow"
            type="button"
            onClick={onOpen}
            aria-label={locale === "en" ? `Open ${listing.title} details` : `打开 ${listing.title} 详情`}
            whileTap={{ scale: 0.9 }}
            transition={spring}
          >
            <ArrowRight size={19} aria-hidden="true" />
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}
