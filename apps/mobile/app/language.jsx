// LANGUAGE — the picker behind Profile's Language row, on the shared registry
// (languagesByRegion) and the native setLanguage(): pick one, the catalog lazy-loads,
// every screen re-reads. Same 13 languages as the web sheet, native names shown.
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react-native'
import { languagesByRegion } from '@connect/core/i18n/languages.js'
import { Screen, Card, Title, Caption, Body } from '../components/UI.jsx'
import { BackButton } from '../components/Header.jsx'
import { setLanguage } from '../lib/i18n.js'
import { vibrate, notifySuccess } from '../lib/haptics.js'

export default function LanguageScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const current = i18n.resolvedLanguage || i18n.language || 'en'
  const regions = languagesByRegion()

  async function pick(code) {
    vibrate(10)
    await setLanguage(code)
    notifySuccess()
    router.back()
  }

  return (
    <Screen>
      <BackButton />
      <Title className="mt-4 mb-3">{t('profile.language', { defaultValue: 'Language' })}</Title>
      {regions.map(r => (
        <View key={r.region}>
          <Caption className="mt-3 mb-2">{r.region}</Caption>
          <Card className="!p-0 overflow-hidden">
            {r.items.map((lang, i) => {
              const on = lang.code === current
              return (
                <View key={lang.code}>
                  {i > 0 && <View className="h-px bg-hairline dark:bg-d-hairline" />}
                  <Pressable
                    onPress={() => pick(lang.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={lang.label}
                    style={({ pressed }) => pressed && { opacity: 0.7 }}
                  >
                    <View className="flex-row items-center gap-3 px-4 py-3">
                      <View className="flex-1 min-w-0">
                        <Body className={`font-hk-semi ${on ? 'text-primaryText dark:text-d-primaryText' : 'text-ink dark:text-d-ink'}`}>
                          {lang.native}
                        </Body>
                        <Caption className="mt-0.5">{lang.label}</Caption>
                      </View>
                      {on && <Check size={16} color="#0070FC" />}
                    </View>
                  </Pressable>
                </View>
              )
            })}
          </Card>
        </View>
      ))}
    </Screen>
  )
}
