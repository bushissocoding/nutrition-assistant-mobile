import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BrandMark from './BrandMark';

const BLUE = '#245CFF';

export default function LaunchScreen({ onComplete, ready = false }) {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const loading = setTimeout(() => setPhase(1), 650);
    const quote = setTimeout(() => setPhase(2), 1550);
    const progressTimer = setInterval(() => setProgress(value => Math.min(100, value + 8)), 72);
    return () => {
      clearTimeout(loading);
      clearTimeout(quote);
      clearInterval(progressTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 2 || !ready) return undefined;
    const finish = setTimeout(onComplete, 900);
    return () => clearTimeout(finish);
  }, [onComplete, phase, ready]);

  return <View style={[styles.screen, phase === 2 && styles.quoteScreen]}>
    <StatusBar barStyle={phase === 2 ? 'dark-content' : 'light-content'} />
    {phase < 2 ? <>
      {phase === 0 ? <View style={styles.splashContent}>
        <BrandMark size={208} color="#FFFFFF" cutout={BLUE} />
        <Text style={styles.credit}>THIẾT KẾ BỞI NHÓM 05</Text>
      </View> : <>
        <View style={styles.watermark}><BrandMark size={380} color="#FFFFFF22" cutout={BLUE} /></View>
        <View style={styles.loadingContent}>
          <Text style={styles.loadingTitle}>Đang tải…</Text>
          <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Đang tải ứng dụng" accessibilityValue={{ min: 0, max: 100, now: progress }}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.shakeHint}>LẮC MÀN HÌNH ĐỂ TƯƠNG TÁC!</Text>
        </View>
      </>}
    </> : <>
      <View style={styles.quoteDecorationTop} />
      <View style={styles.quoteDecorationBottom} />
      <View style={styles.quoteContent}>
        <Text style={styles.quoteMark}>❞</Text>
        <Text style={styles.quote}>“Sức khỏe là sự hài hòa trọn vẹn giữa thể chất và tâm hồn.”</Text>
        <Text style={styles.attribution}>— ARISTOTLE</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" style={styles.skipButton} onPress={onComplete}>
        <Text style={styles.skipText}>Bỏ qua</Text>
      </TouchableOpacity>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  splashContent: { alignItems: 'center', marginTop: -34 },
  credit: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', width: 170, marginTop: 104 },
  watermark: { position: 'absolute', width: 380, height: 720, opacity: 0.13, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] },
  loadingContent: { width: '84%', alignItems: 'center', marginTop: -30 },
  loadingTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginBottom: 18 },
  progressTrack: { width: '100%', height: 15, borderRadius: 5, backgroundColor: '#FFFFFF55', padding: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFFFFF' },
  shakeHint: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 42 },
  quoteScreen: { backgroundColor: '#D4E7FF' },
  quoteDecorationTop: { position: 'absolute', width: 280, height: 220, borderWidth: 14, borderColor: '#B9D6FF', borderRadius: 72, top: -128, right: -132, transform: [{ rotate: '38deg' }] },
  quoteDecorationBottom: { position: 'absolute', width: 300, height: 220, borderWidth: 14, borderColor: '#B9D6FF', borderRadius: 72, bottom: -138, left: -146, transform: [{ rotate: '40deg' }] },
  quoteContent: { width: '90%', alignItems: 'center', paddingHorizontal: 12 },
  quoteMark: { color: BLUE, fontSize: 38, fontWeight: '900', marginBottom: 28 },
  quote: { color: '#26314F', fontSize: 26, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
  attribution: { color: '#164AC9', fontSize: 13, letterSpacing: 1.6, fontWeight: '900', marginTop: 30 },
  skipButton: { position: 'absolute', right: 18, top: 18, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#26314F', fontSize: 13, fontWeight: '800' },
});
