// Small HTML fixtures shared by the tests.
export const GOOD_HOME = `<!doctype html><html lang="en"><head><title>Acme Plumbing: emergency plumber in Leeds</title>
<meta name="description" content="Fast, fair-priced emergency plumbing in Leeds. 24/7 call-outs, fixed quotes and a 12-month guarantee on every repair we complete.">
<link rel="canonical" href="https://acme.test/"><meta name="viewport" content="width=device-width">
<meta property="og:title" content="Acme"><meta property="og:description" content="d"><meta property="og:image" content="https://acme.test/og.png"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme","sameAs":["https://x.com/acme"]},{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is Acme?","acceptedAnswer":{"@type":"Answer","text":"A plumber."}}]}]}</script></head>
<body><nav><a href="/about">About</a> <a href="/contact">Contact</a> <a href="/privacy">Privacy</a> <a href="/terms">Terms</a> <a href="/services">Services</a> <a href="/blog">Blog</a></nav>
<h1>Emergency plumber in Leeds</h1>
<p>Acme is a family plumbing company serving Leeds since 1998. We fix leaks, boilers and blocked drains, usually within 90 minutes, and we have helped over 12000 customers with a 4.9% complaint rate of just 0.4%.</p>
<h2>What does an emergency call-out cost?</h2><p>${"We quote a fixed price before work starts, so there are no surprises. ".repeat(20)}</p>
<h2>How fast can you arrive?</h2><ul><li>Usually within 90 minutes</li><li>Open 24/7</li></ul><h3>Why Acme?</h3>
<p>${"Customers trust us. Read our testimonials and case study pages for proof. ".repeat(15)}</p>
<table><tr><td>a</td></tr></table><img src="/a.jpg" alt="Plumber fixing a boiler"><a href="https://gassafe.test/">Gas Safe</a><a href="mailto:hi@acme.test">Email us</a></body></html>`;

export const POOR_HOME = `<html><head><title>Home</title></head><body><h1>Welcome</h1><h1>Welcome again</h1><img src="/x.png"><p>Coming soon. Contact: the contact address is being set up.</p></body></html>`;
