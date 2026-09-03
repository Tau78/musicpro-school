import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  deactivateOwnAccount,
  getMemberById,
  updateOwnProfile,
  type MemberDetail,
} from "@musicpro/database";
import {
  APP_NAME,
  MEMBER_ROLE_LABELS,
  MemberRole,
  mapPasswordUpdateError,
} from "@musicpro/shared";

import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase";

const PRIVACY_URL = "https://www.musicproeventi.it/privacy";
const NAVY = "#1e3a5f";
const DANGER = "#8b1a1a";
const GOLD = "#c9a227";

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  addressStreet: string;
  addressPostalCode: string;
  addressCity: string;
  addressProvince: string;
  birthDate: string;
  taxCode: string;
  mailingOptIn: boolean;
  photoConsent: boolean;
};

function emptyProfileForm(): ProfileForm {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    addressStreet: "",
    addressPostalCode: "",
    addressCity: "",
    addressProvince: "",
    birthDate: "",
    taxCode: "",
    mailingOptIn: true,
    photoConsent: false,
  };
}

function memberToForm(detail: MemberDetail): ProfileForm {
  return {
    firstName: detail.firstName,
    lastName: detail.lastName,
    phone: detail.phone ?? "",
    addressStreet: detail.addressStreet ?? "",
    addressPostalCode: detail.addressPostalCode ?? "",
    addressCity: detail.addressCity ?? "",
    addressProvince: detail.addressProvince ?? "",
    birthDate: detail.birthDate ?? "",
    taxCode: detail.taxCode ?? "",
    mailingOptIn: detail.mailingOptIn,
    photoConsent: detail.photoConsent,
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  editable = true,
  secureTextEntry = false,
  textContentType,
  passwordRules,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  secureTextEntry?: boolean;
  textContentType?: "none" | "password" | "newPassword" | "emailAddress" | "telephoneNumber";
  passwordRules?: string;
  autoComplete?: "off" | "email" | "password" | "new-password" | "tel" | "name";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputReadonly]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        secureTextEntry={secureTextEntry}
        textContentType={textContentType}
        passwordRules={passwordRules}
        autoComplete={autoComplete}
      />
    </View>
  );
}

export default function ImpostazioniScreen() {
  const { member, roles, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState<ProfileForm>(emptyProfileForm());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [togglingMailing, setTogglingMailing] = useState(false);
  const [togglingPhoto, setTogglingPhoto] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const updateField = useCallback(
    <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setProfileMessage(null);
      setProfileError(null);
    },
    [],
  );

  const loadProfile = useCallback(async () => {
    if (!member?.id) {
      setLoading(false);
      setLoadError("Profilo non disponibile.");
      return;
    }

    setLoading(true);
    setLoadError(null);

    const detail = await getMemberById(supabase, member.id);
    if (!detail) {
      setLoadError("Impossibile caricare i dati personali.");
      setForm({
        ...emptyProfileForm(),
        firstName: member.firstName,
        lastName: member.lastName,
      });
      setLoading(false);
      return;
    }

    setForm(memberToForm(detail));
    setLoading(false);
  }, [member, supabase]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleOpenPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_URL);
  }, []);

  const handleMailingToggle = useCallback(
    async (value: boolean) => {
      if (!member?.id) return;

      const previous = form.mailingOptIn;
      updateField("mailingOptIn", value);
      setTogglingMailing(true);
      setProfileError(null);
      setProfileMessage(null);

      const result = await updateOwnProfile(supabase, member.id, {
        mailingOptIn: value,
      });
      setTogglingMailing(false);

      if (!result.success) {
        updateField("mailingOptIn", previous);
        setProfileError(
          result.errorMessage ?? "Impossibile aggiornare le preferenze mailing.",
        );
        return;
      }

      setProfileMessage(
        value
          ? "Riceverai le comunicazioni della scuola."
          : "Hai disattivato le comunicazioni della scuola.",
      );
    },
    [form.mailingOptIn, member?.id, supabase, updateField],
  );

  const handlePhotoToggle = useCallback(
    async (value: boolean) => {
      if (!member?.id) return;

      const previous = form.photoConsent;
      updateField("photoConsent", value);
      setTogglingPhoto(true);
      setProfileError(null);
      setProfileMessage(null);

      const result = await updateOwnProfile(supabase, member.id, {
        photoConsent: value,
      });
      setTogglingPhoto(false);

      if (!result.success) {
        updateField("photoConsent", previous);
        setProfileError(
          result.errorMessage ?? "Impossibile aggiornare il consenso foto.",
        );
        return;
      }

      setProfileMessage(
        value ? "Consenso foto aggiornato." : "Consenso foto revocato.",
      );
    },
    [form.photoConsent, member?.id, supabase, updateField],
  );

  const handleSaveProfile = useCallback(async () => {
    if (!member?.id) return;

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) {
      setProfileError("Nome e cognome sono obbligatori.");
      setProfileMessage(null);
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    const result = await updateOwnProfile(supabase, member.id, {
      firstName,
      lastName,
      phone: form.phone.trim() || null,
      addressStreet: form.addressStreet.trim() || null,
      addressPostalCode: form.addressPostalCode.trim() || null,
      addressCity: form.addressCity.trim() || null,
      addressProvince: form.addressProvince.trim() || null,
      birthDate: form.birthDate.trim() || null,
      taxCode: form.taxCode.trim() || null,
      mailingOptIn: form.mailingOptIn,
      photoConsent: form.photoConsent,
    });

    setSavingProfile(false);

    if (!result.success) {
      setProfileError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }

    setProfileMessage("Dati personali salvati.");
  }, [form, member?.id, supabase]);

  const handleChangePassword = useCallback(async () => {
    setPasswordError(null);
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordError("La nuova password deve avere almeno 8 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Le password non coincidono.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      setPasswordError(mapPasswordUpdateError(error.message));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password aggiornata.");
  }, [confirmPassword, newPassword, supabase]);

  const handleSwitchUser = useCallback(() => {
    Alert.alert(
      "Cambia utente",
      "Uscirai dall’account corrente e tornerai alla schermata di accesso.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Cambia utente",
          onPress: () => {
            void signOut();
          },
        },
      ],
    );
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Disattiva account",
      "Non potrai più accedere all'app. I dati anagrafici restano in segreteria, che potrà riattivarti. Continuare?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Disattiva",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);
              const result = await deactivateOwnAccount(supabase);
              setDeleting(false);
              if (!result.success) {
                Alert.alert(
                  "Errore",
                  result.errorMessage ?? "Operazione non riuscita.",
                );
                return;
              }
              await signOut();
            })();
          },
        },
      ],
    );
  }, [signOut, supabase]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={NAVY} />
        <Text style={styles.loadingText}>Caricamento impostazioni…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Impostazioni</Text>
        <Text style={styles.description}>
          Privacy, profilo e accesso a {APP_NAME}.
        </Text>

        {loadError ? <Text style={styles.errorBanner}>{loadError}</Text> : null}

        <Text style={styles.sectionHeader}>Privacy</Text>
        <View style={styles.card}>
          <Pressable onPress={handleOpenPrivacy} accessibilityRole="link">
            <Text style={styles.link}>Informativa privacy</Text>
            <Text style={styles.hint}>
              Apre la pagina privacy di MusicPro Eventi.
            </Text>
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Ricevi comunicazioni della scuola</Text>
              <Text style={styles.hint}>
                Newsletter e avvisi. Disattiva per l’opt-out mailing.
              </Text>
            </View>
            <Switch
              value={form.mailingOptIn}
              onValueChange={(value) => {
                void handleMailingToggle(value);
              }}
              disabled={togglingMailing || !member?.id}
              trackColor={{ false: "#d4d4d4", true: NAVY }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Consenso foto / video</Text>
              <Text style={styles.hint}>
                Uso di immagini per attività della scuola.
              </Text>
            </View>
            <Switch
              value={form.photoConsent}
              onValueChange={(value) => {
                void handlePhotoToggle(value);
              }}
              disabled={togglingPhoto || !member?.id}
              trackColor={{ false: "#d4d4d4", true: NAVY }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>Dati personali</Text>
        <View style={styles.card}>
          <Field
            label="Nome"
            value={form.firstName}
            onChangeText={(text) => updateField("firstName", text)}
            autoCapitalize="words"
            autoComplete="name"
          />
          <Field
            label="Cognome"
            value={form.lastName}
            onChangeText={(text) => updateField("lastName", text)}
            autoCapitalize="words"
            autoComplete="name"
          />
          <Field
            label="Telefono"
            value={form.phone}
            onChangeText={(text) => updateField("phone", text)}
            keyboardType="phone-pad"
            autoCapitalize="none"
            textContentType="telephoneNumber"
            autoComplete="tel"
          />
          <Field
            label="Indirizzo (via)"
            value={form.addressStreet}
            onChangeText={(text) => updateField("addressStreet", text)}
            placeholder="Via / piazza"
          />
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <Field
                label="CAP"
                value={form.addressPostalCode}
                onChangeText={(text) => updateField("addressPostalCode", text)}
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.halfField}>
              <Field
                label="Provincia"
                value={form.addressProvince}
                onChangeText={(text) =>
                  updateField("addressProvince", text.toUpperCase().slice(0, 2))
                }
                autoCapitalize="characters"
                placeholder="MI"
              />
            </View>
          </View>
          <Field
            label="Città"
            value={form.addressCity}
            onChangeText={(text) => updateField("addressCity", text)}
            autoCapitalize="words"
          />
          <Field
            label="Data di nascita"
            value={form.birthDate}
            onChangeText={(text) => updateField("birthDate", text)}
            placeholder="AAAA-MM-GG"
            autoCapitalize="none"
            keyboardType="number-pad"
          />
          <Field
            label="Codice fiscale"
            value={form.taxCode}
            onChangeText={(text) =>
              updateField("taxCode", text.toUpperCase().slice(0, 16))
            }
            autoCapitalize="characters"
          />

          {profileError ? (
            <Text style={styles.errorBanner}>{profileError}</Text>
          ) : null}
          {profileMessage ? (
            <Text style={styles.successBanner}>{profileMessage}</Text>
          ) : null}

          <Pressable
            style={[styles.primaryButton, savingProfile && styles.buttonDisabled]}
            onPress={() => {
              void handleSaveProfile();
            }}
            disabled={savingProfile || !member?.id}
          >
            {savingProfile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Salva</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionHeader}>Accesso</Text>
        <View style={styles.card}>
          <Field
            label="Email"
            value={member?.email ?? "—"}
            editable={false}
            textContentType="emailAddress"
            autoComplete="email"
          />

          <Pressable
            style={styles.secondaryButton}
            onPress={handleSwitchUser}
            disabled={deleting}
          >
            <Text style={styles.secondaryButtonText}>Cambia utente</Text>
          </Pressable>

          <View style={styles.divider} />

          <Text style={styles.cardSubtitle}>Cambia password</Text>
          <Text style={styles.hint}>
            Almeno 8 caratteri. Non serve la password attuale.
          </Text>
          <Field
            label="Nuova password"
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              setPasswordError(null);
              setPasswordMessage(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            textContentType="none"
            passwordRules=""
            autoComplete="new-password"
          />
          <Field
            label="Conferma password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setPasswordError(null);
              setPasswordMessage(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            textContentType="none"
            passwordRules=""
            autoComplete="new-password"
          />

          {passwordError ? (
            <Text style={styles.errorBanner}>{passwordError}</Text>
          ) : null}
          {passwordMessage ? (
            <Text style={styles.successBanner}>{passwordMessage}</Text>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
              savingPassword && styles.buttonDisabled,
            ]}
            onPress={() => {
              void handleChangePassword();
            }}
            disabled={savingPassword}
          >
            {savingPassword ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Aggiorna password</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionHeader}>Ruoli</Text>
        <View style={styles.card}>
          {roles.length > 0 ? (
            roles.map((role) => (
              <Text key={role} style={styles.roleBadge}>
                {MEMBER_ROLE_LABELS[role as MemberRole]}
              </Text>
            ))
          ) : (
            <Text style={styles.stub}>Nessun ruolo assegnato.</Text>
          )}
          {member?.memberNumber ? (
            <Text style={styles.metaMuted}>
              N. associato: {member.memberNumber}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.sectionHeader, styles.dangerHeader]}>Zona pericolosa</Text>
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>Elimina account (disattiva)</Text>
          <Text style={styles.dangerHint}>
            Disattiva l&apos;accesso all&apos;app. L&apos;anagrafica associato resta in
            segreteria e può essere riattivata manualmente.
          </Text>
          <Pressable
            style={styles.dangerButton}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.dangerButtonText}>
                Elimina account (disattiva)
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.signOutButton}
            onPress={() => {
              void signOut();
            }}
            disabled={deleting}
          >
            <Text style={styles.signOutButtonText}>Esci</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#666",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: NAVY,
  },
  description: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: NAVY,
  },
  dangerHeader: {
    color: DANGER,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  dangerCard: {
    borderColor: "#e8c9c9",
  },
  cardSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: NAVY,
    marginBottom: 4,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
    color: "#222",
    backgroundColor: "#fff",
  },
  inputReadonly: {
    backgroundColor: "#f5f5f5",
    color: "#555",
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#222",
  },
  hint: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  link: {
    fontSize: 15,
    fontWeight: "600",
    color: NAVY,
    textDecorationLine: "underline",
    textDecorationColor: GOLD,
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e5e5",
    marginVertical: 14,
  },
  primaryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: NAVY,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 140,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 4,
    marginBottom: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: NAVY,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorBanner: {
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f0c0c0",
    backgroundColor: "#fdf2f2",
    color: DANGER,
    fontSize: 13,
    lineHeight: 18,
  },
  successBanner: {
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8e0c8",
    backgroundColor: "#f3faf3",
    color: "#1a5c2a",
    fontSize: 13,
    lineHeight: 18,
  },
  roleBadge: {
    marginTop: 4,
    fontSize: 14,
    color: NAVY,
    fontWeight: "500",
  },
  metaMuted: {
    marginTop: 10,
    fontSize: 13,
    color: "#666",
  },
  stub: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: DANGER,
  },
  dangerHint: {
    marginTop: 8,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  dangerButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: DANGER,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 200,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  signOutButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  signOutButtonText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
});
