"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              ML
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              MetaLend
            </span>
          </div>

          <Link
            href="/app"
            className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-6"
          >
            Decentralized Lending on BNB Chain
          </motion.p>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 leading-[1.1] mb-6"
          >
            Lend, Borrow &<br />
            <span className="bg-linear-to-r from-gray-900 via-[#F0B90B] to-gray-900 bg-clip-text text-transparent">Earn Yield</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="text-lg text-gray-500 max-w-xl mx-auto mb-10"
          >
            Supply assets, earn interest, and borrow against your collateral.
            Powered by AI liquidation bots for maximum capital efficiency.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="flex items-center justify-center gap-4 mb-16"
          >
            <Link
              href="/app"
              className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-all hover:shadow-lg hover:shadow-gray-300/50"
            >
              Launch App
            </Link>
            <a
              href="https://github.com/deepesh-sr/LendBNB"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-200 hover:border-gray-400 text-gray-600 font-medium px-8 py-3.5 rounded-xl text-base transition-colors"
            >
              GitHub
            </a>
          </motion.div>

          {/* Video Container */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="relative max-w-4xl mx-auto"
          >
            <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-2xl shadow-gray-200/60 aspect-video">
              <iframe
                src="https://player.cloudinary.com/embed/?cloud_name=dlb4urosq&public_id=video_20260228_103603_nq95g6&autoplay=true&loop=true&muted=true&controls=false"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                className="w-full h-full scale-150"
              />
            </div>
            {/* Subtle glow behind video */}
            <div className="absolute -inset-4 bg-linear-to-b from-gray-100 to-transparent -z-10 rounded-3xl" />
          </motion.div>
        </div>
      </section>

      {/* Stats Strip */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="border-y border-gray-100 bg-gray-50/50"
      >
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Protocol", value: "MetaLend" },
            { label: "Network", value: "BNB Chain" },
            { label: "Markets", value: "2 Active" },
            { label: "Liquidation", value: "AI Powered" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-center text-gray-900 mb-12"
          >
            How it works
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Supply Assets",
                desc: "Deposit USDT into lending pools and start earning yield immediately.",
              },
              {
                step: "02",
                title: "Borrow Against Collateral",
                desc: "Lock BNB or BTCB as collateral and borrow USDT at competitive rates.",
              },
              {
                step: "03",
                title: "AI Liquidation Bots",
                desc: "Automated bots monitor positions 24/7 and execute flash loan liquidations.",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="bg-white border border-gray-100 rounded-xl p-8 hover:shadow-lg hover:shadow-gray-100/80 transition-shadow"
              >
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm mb-4">
                  {feature.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-900 rounded flex items-center justify-center text-white font-bold text-xs">
              M
            </div>
            <span className="text-sm text-gray-400">MetaLend BNB</span>
          </div>
          <p className="text-sm text-gray-400">
            Built for BNB Chain Hackathon 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
