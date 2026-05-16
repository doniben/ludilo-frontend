import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

function WaveformVisual() {
  const bars = Array.from({ length: 48 }, (_, i) => {
    const h = 20 + Math.sin(i * 0.4) * 30 + Math.random() * 20;
    return h;
  });

  return (
    <div className="flex items-end justify-center gap-[2px] h-24 opacity-60">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-neon-cyan to-neon-magenta"
          initial={{ height: 4 }}
          animate={{ height: h }}
          transition={{ duration: 0.8, delay: i * 0.02, repeat: Infinity, repeatType: "reverse", repeatDelay: 1 + Math.random() }}
        />
      ))}
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div
      variants={fadeUp}
      className="card-solid p-6 group hover:border-neon-cyan/30 dark:hover:border-neon-cyan/30 transition-all duration-300"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan/10 to-neon-magenta/10 dark:from-neon-cyan/20 dark:to-neon-magenta/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <span className="text-xl">{icon}</span>
      </div>
      <h3 className="font-display font-semibold text-lg mb-2 text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    { icon: "🎛️", key: "stems" },
    { icon: "🎹", key: "midi" },
    { icon: "🎵", key: "visualization" },
    { icon: "🎚️", key: "mixer" },
    { icon: "📚", key: "library" },
    { icon: "⏱️", key: "speed" },
  ];

  return (
    <main className="relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-neon-cyan/5 dark:bg-neon-cyan/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-neon-magenta/5 dark:bg-neon-magenta/8 blur-[120px]" />
      </div>

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-24 pb-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div variants={fadeUp} className="mb-8">
            <WaveformVisual />
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="font-display font-bold text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight mb-6"
          >
            <span className="text-gradient">{t("hero.title")}</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            {t("hero.subtitle")}
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/upload" className="btn-primary text-base px-8 py-4">
              {t("hero.cta")}
            </a>
            <a href="/library" className="btn-secondary text-base px-8 py-4">
              {t("hero.cta_secondary")}
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-5 h-8 rounded-full border-2 border-gray-400 dark:border-gray-600 flex justify-center pt-1.5">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1 h-1 rounded-full bg-neon-cyan"
            />
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.h2
              variants={fadeUp}
              className="font-display font-bold text-3xl sm:text-4xl md:text-5xl text-center mb-16 text-gray-900 dark:text-white"
            >
              {t("features.title")}
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <FeatureCard
                  key={f.key}
                  icon={f.icon}
                  title={t(`features.${f.key}.title`)}
                  description={t(`features.${f.key}.description`)}
                  delay={i * 0.1}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA bottom */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="card-glass p-12 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/5 to-neon-magenta/5" />
              <div className="relative">
                <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4 text-gray-900 dark:text-white">
                  🎸
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                  {t("hero.subtitle")}
                </p>
                <a href="/register" className="btn-primary text-base px-8 py-4">
                  {t("nav.register")}
                </a>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
