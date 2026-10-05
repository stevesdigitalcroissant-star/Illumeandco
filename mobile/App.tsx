// Illume — the studio as an iPhone / iPad app.
//
// The app shows Illume Studio (illumeandco.online/generation) in a full-screen native
// frame, so everything you build on the website is in the app the moment it ships.
// The app adds what a web page can't do on iOS:
//   • files (takes, exported cuts) open the share sheet → Save to Photos, Files, AirDrop
//   • a light vibration when a take finishes
//   • links to other sites (Stripe receipts, Google, photo credits, emails) open outside the app
//   • a calm offline screen with "Try again" instead of a browser error
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { File, Paths } from "expo-file-system";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

const STUDIO = "https://www.illumeandco.online/generation";
const HOME_HOSTS = ["illumeandco.online", "www.illumeandco.online"];
// Pages that must stay inside the app because they come back to the studio afterwards.
const STAY_INSIDE = [/^https:\/\/checkout\.stripe\.com\//, /^https:\/\/(www\.)?illumeandco\.online\//];

const GOLD = "#E8B54B";
const INK = "#0C0B09";

SplashScreen.preventAutoHideAsync().catch(() => {});

type Saving = { name: string; mime: string; file: File };

export default function App() {
  const web = useRef<WebView>(null);
  const saving = useRef<Record<string, Saving>>({});
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const ready = useCallback(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(ready, 6000); return () => clearTimeout(t); }, [ready]); // never stuck on the splash

  // Messages from the studio page (see "inside the Illume iPhone/iPad app" in Generation/index.html).
  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: any; try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    try {
      if (msg.type === "haptic") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (msg.type === "save-start") {
        const safe = String(msg.name || "illume-file").replace(/[\\/:*?"<>|]+/g, "_");
        const file = new File(Paths.cache, `${Date.now()}-${safe}`);
        if (file.exists) file.delete();
        file.create();
        saving.current[msg.id] = { name: safe, mime: msg.mime, file };
        setBusy("Preparing your file…");
      }
      if (msg.type === "save-chunk") saving.current[msg.id]?.file.write(msg.data, { encoding: "base64", append: true });
      if (msg.type === "save-end") {
        const s = saving.current[msg.id]; delete saving.current[msg.id]; setBusy(null);
        if (!s) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(s.file.uri, { mimeType: s.mime, dialogTitle: s.name });
      }
    } catch (err: any) {
      setBusy(null);
      web.current?.injectJavaScript(`typeof note === "function" && note(${JSON.stringify("Couldn't save the file: " + (err?.message || err))}, true); true;`);
    }
  }, []);

  // Where links go: the studio and Stripe stay inside; everything else opens outside the app.
  const onShouldStart = useCallback((req: { url: string; isTopFrame?: boolean }) => {
    const url = req.url;
    if (url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return true;
    if (STAY_INSIDE.some(r => r.test(url))) return true;
    if (req.isTopFrame === false) return true; // embedded frames (e.g. Stripe widgets)
    if (/^(mailto|tel|sms):/.test(url)) { Linking.openURL(url).catch(() => {}); return false; }
    if (/^https?:/.test(url)) { WebBrowser.openBrowserAsync(url).catch(() => {}); return false; }
    return false;
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        {offline ? (
          <View style={styles.center}>
            <View style={styles.dot} />
            <Text style={styles.title}>You're offline</Text>
            <Text style={styles.body}>Illume needs a connection to create and load your work.</Text>
            <Pressable style={styles.button} onPress={() => { setOffline(false); web.current?.reload(); }}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={web}
            source={{ uri: STUDIO }}
            style={styles.web}
            originWhitelist={["https://*", "about:*", "blob:*", "data:*", "mailto:*", "tel:*"]}
            applicationNameForUserAgent="IllumeApp/1.0"
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStart}
            onOpenWindow={e => { const u = e.nativeEvent.targetUrl; if (HOME_HOSTS.some(h => u.includes(h)) && !u.includes("/review/")) web.current?.injectJavaScript(`location.href=${JSON.stringify(u)}; true;`); else WebBrowser.openBrowserAsync(u).catch(() => {}); }}
            onLoadEnd={ready}
            onError={() => { ready(); setOffline(true); }}
            onContentProcessDidTerminate={() => web.current?.reload()}
            sharedCookiesEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsBackForwardNavigationGestures
            allowsLinkPreview={false}
            pullToRefreshEnabled
            setSupportMultipleWindows
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            keyboardDisplayRequiresUserAction={false}
            startInLoadingState
            renderLoading={() => <View style={[styles.center, StyleSheet.absoluteFill]}><ActivityIndicator color={GOLD} /></View>}
          />
        )}
        {busy ? (
          <View style={styles.toast} pointerEvents="none"><ActivityIndicator color={GOLD} size="small" /><Text style={styles.toastText}>{busy}</Text></View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: INK },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: INK },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: GOLD, marginBottom: 18, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  title: { color: "#F3EDE2", fontSize: 30, fontWeight: "300", fontFamily: "Georgia", marginBottom: 8 },
  body: { color: "#B4AA9A", fontSize: 16, textAlign: "center", marginBottom: 22, maxWidth: 320 },
  button: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 26 },
  buttonText: { color: "#1A1408", fontWeight: "700", fontSize: 16 },
  toast: { position: "absolute", alignSelf: "center", bottom: 40, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(27,24,20,0.96)", borderColor: "rgba(255,236,200,0.16)", borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16 },
  toastText: { color: "#F3EDE2", fontSize: 14 },
});
