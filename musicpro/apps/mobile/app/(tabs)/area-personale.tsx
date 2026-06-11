import { Pressable, StyleSheet, Text, View } from "react-native";

import { APP_NAME, MEMBER_ROLE_LABELS, MemberRole } from "@musicpro/shared";

import { useAuth } from "@/contexts/AuthContext";

export default function AreaPersonaleScreen() {
  const { member, roles, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        Ciao{member ? `, ${member.firstName}` : ""}!
      </Text>
      <Text style={styles.description}>
        Benvenuto nell&apos;area personale di {APP_NAME}.
      </Text>

      {member ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profilo</Text>
          <Text style={styles.cardLine}>
            {member.firstName} {member.lastName}
          </Text>
          <Text style={styles.cardMuted}>{member.email ?? "—"}</Text>
          {member.memberNumber ? (
            <Text style={styles.cardMuted}>N. associato: {member.memberNumber}</Text>
          ) : null}
        </View>
      ) : null}

      {roles.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ruoli</Text>
          {roles.map((role) => (
            <Text key={role} style={styles.roleBadge}>
              {MEMBER_ROLE_LABELS[role as MemberRole]}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.stub}>Nessun ruolo assegnato.</Text>
      )}

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Esci</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fafafa",
  },
  greeting: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1e3a5f",
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
  },
  card: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e3a5f",
    marginBottom: 8,
  },
  cardLine: {
    fontSize: 16,
    fontWeight: "500",
    color: "#222",
  },
  cardMuted: {
    marginTop: 4,
    fontSize: 14,
    color: "#666",
  },
  roleBadge: {
    marginTop: 6,
    fontSize: 14,
    color: "#1e3a5f",
    fontWeight: "500",
  },
  stub: {
    marginTop: 16,
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  button: {
    marginTop: 24,
    alignSelf: "flex-start",
    backgroundColor: "#1e3a5f",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
