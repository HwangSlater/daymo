import { StyleSheet, View } from "react-native";

import { Chip } from "./ui/Chip";
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
              <Chip
                key={region.name}
                theme={theme}
                label={region.name}
                on={selected}
                onPress={() => onChange(region.name)}
                accessibilityLabel={`${region.name} 지역`}
              />
            );
          })}
        <Chip
          theme={theme}
          label={expanded ? "간단히 보기" : "전체 지역 보기"}
          dashed
          on={false}
          onPress={() => setExpanded(!expanded)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: typo.label.family },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 6, paddingBottom: 16 },
});
