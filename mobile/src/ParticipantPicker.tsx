import { Pressable, StyleSheet, View } from "react-native";
import { Glyph } from "./Glyph";
import { Text } from "./AppText";
import { AppTheme } from "./theme";
import { typo } from "./theme/typography";

/**
 * 이번 여행에 누가 가는지 고르는 자리.
 *
 * 한 공간에 멤버가 여럿이어도 여행마다 가는 사람은 다르다. 동호회라면 매번
 * 다르고, 둘이 쓰는 공간이라도 한 명만 다녀오는 여행이 있다. 그래서 참가자는
 * 공간이 아니라 여행에 붙는 값이고, 여행을 만들 때와 고칠 때 모두 여기서
 * 고른다. 지출의 몫, 준비물·재료 담당, 교통편 이용자가 전부 이 목록을 쓴다.
 *
 * `noteFor` 는 그 사람 이름으로 이미 적어 둔 것을 한 줄로 돌려준다. 빼기 전에
 * 무엇이 걸려 있는지 알려 주려고 받는다. 여행을 처음 만들 때는 적은 게 없으니
 * 넘기지 않아도 된다.
 */
export function ParticipantPicker({ theme, members, value, onChange, noteFor, hint }: {
  theme: AppTheme;
  /** 고를 수 있는 사람. 이 여행이 속한 공간의 멤버 전원이다. */
  members: string[];
  value: string[];
  onChange: (next: string[]) => void;
  noteFor?: (person: string) => string;
  hint?: string;
}) {
  const toggle = (person: string) => {
    onChange(
      value.includes(person)
        ? value.filter((name) => name !== person)
        : // 공간 멤버 순서를 지킨다. 뺐다 다시 넣었다고 맨 뒤로 가면 화면마다
          // 사람 순서가 달라진다.
          members.filter((name) => value.includes(name) || name === person),
    );
  };
  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.label, { color: theme.muted }]}>이번 여행 참가자</Text>
        <Text style={[styles.count, { color: value.length ? theme.primary : theme.muted }]}>
          {value.length}명
        </Text>
      </View>
      <View style={styles.rows}>
        {members.map((person) => {
          const joined = value.includes(person);
          const note = joined ? "" : noteFor?.(person) ?? "";
          return (
            <Pressable
              key={person}
              onPress={() => toggle(person)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: joined }}
              accessibilityLabel={`${person} 참가`}
              style={[
                styles.row,
                {
                  borderColor: joined ? theme.primary : theme.border,
                  backgroundColor: joined ? theme.primarySoft : theme.surface,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.name, { color: joined ? theme.primary : theme.muted }]}>
                {person}
              </Text>
              {/* 이 사람 이름으로 적어 둔 게 있으면 빼기 전에 알려 준다. 담당은
                  이름으로 묶여 있어서 빼고 나면 어디에 남았는지 찾기 어렵다. */}
              {Boolean(note) && (
                <Text numberOfLines={1} style={[styles.note, { color: theme.accent }]}>{note}</Text>
              )}
              {joined && <Glyph name="check" size={16} color={theme.primary} weight={2.6} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: theme.muted }]}>
        {hint ?? "몫을 따로 안 적은 지출은 여기 고른 사람들이 똑같이 나눠요. 준비물과 교통편의 담당도 이 사람들 중에서 고르게 돼요."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 12, fontFamily: typo.label.family },
  count: { fontSize: 12, fontFamily: typo.data.family },
  rows: { gap: 8, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  name: { flex: 1, fontSize: 14, fontFamily: typo.title.family },
  note: { fontSize: 12, fontFamily: typo.caption.family },
  hint: { fontSize: 12, marginTop: 10, lineHeight: 17, fontFamily: typo.caption.family },
});
