import type { NodeId } from "@acezilla/models";

/** What a number on the map is made from, so the page can show the person's own figure beside it. */
export type MetricKey = "cpc" | "ctr" | "cpa" | "roas" | "storeRoas" | "spend";
export interface MonitorLine { label: string; metric?: MetricKey; how: string; healthy: string }
export interface NodeText {
  job: string;
  /** Steps in the order to do them. Each is ticked off by hand. */
  build: string[];
  monitor: MonitorLine[];
  /** If a platform has no data yet, these are the changes to expect to make. */
  change: { when: string; then: string }[];
  /** Where in acezilla to work on it. */
  open: { label: string; href: string }[];
}

/** Plain-language playbook for each part of the map. Rules of thumb are called that. */
export const NODE_TEXT: Record<NodeId, NodeText> = {
  meta_prospecting: {
    job: "Show your best product to people who have never heard of you, so the shop has new customers to win later.",
    build: [
      "Pick one product to lead with: your best seller or the one with the best margin.",
      "Install the Meta pixel on your shop and send the purchase event, so Meta can learn who buys.",
      "Make three different ads (a video, a photo, a customer's words). Give each one a single clear message.",
      "Start one sales campaign aimed at all of Poland, with no narrow interests. Let Meta find the buyers.",
      "Set a daily budget of at least the most you can pay for one sale, so the campaign can afford a sale every day.",
      "Leave it alone for 3 to 4 days before you judge it. Early numbers are noise.",
    ],
    monitor: [
      { label: "Return (platform's count)", metric: "roas", how: "Weekly", healthy: "Above your break-even return. The platform tends to over-count, so also check the store's return." },
      { label: "Return on real store orders", metric: "storeRoas", how: "Weekly", healthy: "Close to the platform's figure. A big gap means over-counting or missing tags." },
      { label: "Cost per sale", metric: "cpa", how: "Weekly", healthy: "Below the most you can pay for one sale." },
      { label: "Click rate", metric: "ctr", how: "Twice a week", healthy: "Steady. A fall of a fifth or more in a week usually means a tired ad." },
      { label: "Cost per click", metric: "cpc", how: "Twice a week", healthy: "Steady. A sudden rise means rivals or a tired audience." },
      { label: "Frequency (inside Meta)", how: "Weekly", healthy: "Rule of thumb: over about 3 on a cold audience often means the same people see the ad too much." },
    ],
    change: [
      { when: "Return is below break-even after enough spend", then: "Cut the budget by 20 to 30% and pause the weakest ads." },
      { when: "Click rate falls by a fifth", then: "Add one new picture or video and rest the old one." },
      { when: "Return is above target for two weeks and steady", then: "Raise the budget 15 to 20%, every 3 to 4 days at most." },
    ],
    open: [{ label: "Campaign builder", href: "/builder" }, { label: "Attribution", href: "/attribution" }],
  },
  tiktok_prospecting: {
    job: "Reach people who scroll short videos. It is good for products that look good in motion, and it needs fresh videos often.",
    build: [
      "Install the TikTok pixel and send the purchase event.",
      "Film three upright (9:16) videos. The first two seconds must show the product or the problem.",
      "Use real people or customers talking, not a polished advert. Native-looking videos tend to hold attention.",
      "Start with a small test budget on one campaign, aimed at all of Poland.",
      "Plan to replace videos every 1 to 2 weeks. They tire faster than photos.",
    ],
    monitor: [
      { label: "Return (platform's count)", metric: "roas", how: "Weekly", healthy: "Above your break-even return." },
      { label: "Return on real store orders", metric: "storeRoas", how: "Weekly", healthy: "Close to the platform's figure." },
      { label: "Cost per sale", metric: "cpa", how: "Weekly", healthy: "Below the most you can pay for one sale." },
      { label: "Click rate", metric: "ctr", how: "Every few days", healthy: "Steady. Falling means the video is tired." },
      { label: "Cost per click", metric: "cpc", how: "Every few days", healthy: "Steady." },
      { label: "Watched past 2 seconds (inside TikTok)", how: "Weekly", healthy: "If few people watch, the opening is the problem, not the product." },
    ],
    change: [
      { when: "Click rate falls by a fifth", then: "Swap in a new video. Do not change the audience first." },
      { when: "Many views but no sales", then: "Look at the shop page and the price before blaming the video." },
      { when: "A video clearly beats the others", then: "Make three variations of it: different opening, same idea." },
    ],
    open: [{ label: "Competitor ads", href: "/competitors" }, { label: "Campaign builder", href: "/builder" }],
  },
  seo_content: {
    job: "Free traffic from people who already search for what you sell. It is slow, but every click costs nothing.",
    build: [
      "Connect Search Console so you can see the exact words shoppers use.",
      "Run the SEO audit and fix the findings marked as most important.",
      "For each word that almost reaches page one, make sure a page or product title uses that exact word.",
      "Add short answers to common questions on your product pages. AI search tools quote these.",
    ],
    monitor: [
      { label: "Clicks from Google", how: "Monthly", healthy: "Rising. It moves slowly, so judge over a month." },
      { label: "Average position", how: "Monthly", healthy: "Falling towards 1. Words near positions 6 to 20 are the cheapest to push up." },
      { label: "Words almost on page one", how: "Monthly", healthy: "The list shrinks as pages improve." },
    ],
    change: [
      { when: "A word sits at positions 6 to 20 with many views", then: "Build the title and top of a page around that exact word." },
      { when: "A page has views but almost no clicks", then: "Rewrite its title and description to promise something specific." },
    ],
    open: [{ label: "SEO & AI search", href: "/seo" }],
  },
  google_search: {
    job: "Catch people typing exactly what you sell. They are close to buying, so it usually costs more per click and sells better.",
    build: [
      "List 10 to 20 words a buyer would type, starting from your Search Console words.",
      "Use phrase or exact match, so you pay only for searches that mean something.",
      "Write ads with the price, the delivery time and one reason to buy.",
      "Add words to exclude: free, DIY, used, instructions, and anything that is not a buyer.",
      "Make sure the page the ad opens shows that exact product.",
    ],
    monitor: [
      { label: "Return (platform's count)", metric: "roas", how: "Weekly", healthy: "Above your break-even return." },
      { label: "Return on real store orders", metric: "storeRoas", how: "Weekly", healthy: "Close to the platform's figure." },
      { label: "Cost per sale", metric: "cpa", how: "Weekly", healthy: "Below the most you can pay for one sale." },
      { label: "Cost per click", metric: "cpc", how: "Weekly", healthy: "Steady. Rising means rivals are bidding up the same words." },
      { label: "Search terms report (inside Google Ads)", how: "Weekly", healthy: "Add every irrelevant search as a word to exclude." },
    ],
    change: [
      { when: "A search word costs a lot and sells nothing", then: "Pause it or make it an excluded word." },
      { when: "A word sells well", then: "Give it its own ad group and a little more budget." },
    ],
    open: [{ label: "SEO & AI search", href: "/seo" }, { label: "Attribution", href: "/attribution" }],
  },
  google_shopping: {
    job: "Show your product with a photo and price when people search for it. It only works for products Google approves.",
    build: [
      "Connect Merchant Center and get your products approved.",
      "Fix every blocked product. Check the Products page for the reason.",
      "Link Merchant Center to Google Ads.",
      "Start one Shopping or Performance Max campaign with your best-margin products first.",
      "After about 30 sales, let Google bid to a return target equal to your target return (rule of thumb from Google).",
    ],
    monitor: [
      { label: "Blocked products", how: "Weekly", healthy: "Zero for products you advertise. See the Products page." },
      { label: "Return (platform's count)", metric: "roas", how: "Weekly", healthy: "Above your break-even return." },
      { label: "Return on real store orders", metric: "storeRoas", how: "Weekly", healthy: "Close to the platform's figure." },
      { label: "Price against the market", how: "Weekly", healthy: "Products far above Google's market price rarely win clicks. See the Products page." },
      { label: "Cost per click", metric: "cpc", how: "Weekly", healthy: "Steady." },
    ],
    change: [
      { when: "A product is blocked", then: "Fix the reason in the feed, or pause its ads until Google approves it." },
      { when: "A product is well above the market price", then: "Check whether your product earns the premium. If not, lower the price or stop advertising it." },
      { when: "A few products take all the spend and sell", then: "Put them in their own campaign with their own budget." },
    ],
    open: [{ label: "Products", href: "/products" }, { label: "Attribution", href: "/attribution" }],
  },
  meta_retargeting: {
    job: "Remind people who visited or added to the cart but did not buy. It is usually your best return, but it only works once enough people visit.",
    build: [
      "Wait until the shop has roughly 1,000 visitors in 30 days (rule of thumb). With fewer, the audience is too small.",
      "Make two audiences: added to cart in the last 7 days, and visited in the last 30 days.",
      "Exclude people who already bought.",
      "Show a reminder with one reason to come back: delivery date, return policy or a review.",
      "Keep it to about a fifth of your ad budget. It cannot create new demand.",
    ],
    monitor: [
      { label: "Return (platform's count)", metric: "roas", how: "Weekly", healthy: "Usually the highest of your channels. It may be inflated, because those people were likely to buy anyway." },
      { label: "Return on real store orders", metric: "storeRoas", how: "Weekly", healthy: "Close to the platform's figure." },
      { label: "Frequency (inside Meta)", how: "Weekly", healthy: "Rule of thumb: above about 5 a week starts to annoy people." },
      { label: "Share of budget", metric: "spend", how: "Monthly", healthy: "Around a fifth of the total. More means you are not finding new buyers." },
    ],
    change: [
      { when: "Frequency climbs above 5 in a week", then: "Shorten the window or lower the budget." },
      { when: "The audience is small and the spend is high", then: "Move some of the budget to finding new people." },
    ],
    open: [{ label: "Campaign builder", href: "/builder" }],
  },
  allegro_ads: {
    job: "Push your offers inside Allegro, where people already come to buy. You pay Allegro for the click and Allegro takes a commission on the sale.",
    build: [
      "Choose the offers with the best margin after Allegro's commission and your costs.",
      "Turn on sponsored offers for only those, with a daily limit.",
      "Upload the Allegro Ads report to acezilla so spend is counted with the rest.",
      "Compare cost of sale with your margin on that offer, not with the price.",
    ],
    monitor: [
      { label: "Ad spend", metric: "spend", how: "Weekly", healthy: "Within the limit you set." },
      { label: "Cost of sale on each offer", how: "Weekly", healthy: "Below the margin you earn on it after Allegro's commission." },
      { label: "Visits and orders per offer", how: "Weekly", healthy: "Rising together. Visits without orders means the offer page needs work." },
    ],
    change: [
      { when: "An offer's cost of sale is above its margin", then: "Stop promoting it, or raise its price." },
      { when: "An offer sells well with ads", then: "Raise its daily limit a little and watch the margin." },
    ],
    open: [{ label: "Attribution", href: "/attribution" }, { label: "Connections", href: "/connections" }],
  },
  store: {
    job: "Every ad ends here. If the shop does not convert, more ad money only buys more visitors who leave.",
    build: [
      "Open the shop on a phone and buy something. Fix whatever feels slow or confusing.",
      "Show delivery time, returns and payment methods before the checkout, not at the end.",
      "Put real reviews on the product page.",
      "Make sure the ad's product and price are what the visitor lands on.",
      "Check your prices against Google's market price on the Products page.",
    ],
    monitor: [
      { label: "Visits that become orders", how: "Weekly", healthy: "Rising. Ask Analytics; a rate of 1 to 3% is common for shops (rule of thumb)." },
      { label: "Average order", how: "Monthly", healthy: "Rising slowly. A higher order value raises the most you can pay for a sale." },
      { label: "Price against the market", how: "Monthly", healthy: "Close to Google's market price, or a reason for the difference." },
    ],
    change: [
      { when: "Many visits but few orders", then: "Fix the shop before buying more traffic: speed, trust, delivery information." },
      { when: "Orders are many but profit is small", then: "Raise prices on the products that sell best, or lower the cost of goods." },
    ],
    open: [{ label: "Attribution", href: "/attribution" }, { label: "Products", href: "/products" }],
  },
  email: {
    job: "Get repeat buyers without paying for each click. Past buyers are the cheapest customers you will ever have.",
    build: [
      "Ask for an email address at checkout, with a clear tick box for consent (GDPR).",
      "Set up a welcome email and an email after delivery asking for a review.",
      "Send a reminder 60 to 90 days later with something they used up or a matching product.",
      "Keep it to one useful email a week at most.",
    ],
    monitor: [
      { label: "Share of repeat buyers", how: "Monthly", healthy: "Rising. See the customers figure on the Attribution page." },
      { label: "Unsubscribes (inside your email tool)", how: "Weekly", healthy: "Low and stable. A spike means you sent too much or sent the wrong thing." },
    ],
    change: [
      { when: "Few buyers come back", then: "Add the after-delivery and 60-day emails before anything else." },
      { when: "Unsubscribes spike", then: "Send less often and make each email about one thing." },
    ],
    open: [{ label: "Attribution", href: "/attribution" }],
  },
};
