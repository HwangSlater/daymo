import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { AppTheme } from "./theme";
import { typo } from "./theme/typography";
import { primaryTripRegions, tripRegions } from "./tripRegions";

export function TripRegionPicker({ theme, value, onChange, expanded, setExpanded }: {
  theme: AppTheme;
  value: string;
  onChange: (value: string) => void;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}) {
  return (
    <View>
      <Text style={[styles.label, { color: theme.muted }]}>지역</Text>
      <View style={styles.choices}>
        {tripRegions
          .filter((region) => expanded || primaryTripRegions.includes(region.name) || region.name === value)
          .map((region) => {
            const selected = value === region.name;
            return (
              <Pressable
                key={region.name}
                onPress={() => onChange(region.name)}
                accessibilityRole="button"
                accessibilityLabel={`${region.name} 지역`}
                accessibilityState={{ selected }}
                style={[
                  styles.choice,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  selected && { backgroundColor: theme.primarySoft, borderColor: theme.primary },
                ]}
              >
                <Text style={[styles.choiceText, { color: selected ? theme.primary : theme.muted }]}>{region.name}</Text>
              </Pressable>
            );
          })}
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={[styles.choice, styles.more, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
        >
          <Text style={[styles.choiceText, { color: theme.primary }]}>{expanded ? "간단히 보기" : "전체 지역 +"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: typo.label.family },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 6, paddingBottom: 16 },
  choice: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  more: { borderStyle: "dashed" },
  choiceText: { fontSize: 12, fontFamily: typo.label.family },
});
