export const SignUpModalKind = {
  AddConnection: Symbol("Add Connection"),
  AddToSheet: Symbol("Add to Sheet"),
  AddTranslation: Symbol("Add Translation"),
  Follow: Symbol("Follow"),
  Notes: Symbol("Notes"),
  Save: Symbol("Save"),
  Default: Symbol("Default"),
};

const signUpModalContent = {
  [SignUpModalKind.AddConnection]: {
    h2: "model.sign_up.add_connection.connection_to_another_text",
    h3: "model.sign_up.add_connection.create_free_account",
    contentList: [
      {
        icon: "tools-add-connection-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.add_interconnection_and_translation",
      },
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.build_and_share_source_sheet",
      },
      {
        icon: "note-white.png",
        bulletContent: "model.sign_up.add_connection.content_list.take_notes",
      },
      {
        icon: "email-white.png",
        bulletContent: "model.sign_up.add_connection.content_list.get_updates_on_new_texts",
      },
    ],
  },
  [SignUpModalKind.AddToSheet]: {
    h2: "model.sign_up.add_to_sheet.want_to_make_your_own_source_sheet",
    h3: "model.sign_up.add_to_sheet.create_free_accout_to_join_conversation",
    contentList: [
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_to_sheet.build_share_source_sheet",
      },
      {
        icon: "star-white.png",
        bulletContent: "text.save_text",
      },
      {
        icon: "note-white.svg",
        bulletContent: "note.take_note",
      },
      {
        icon: "share-icon-white.svg",
        bulletContent: "model.sign_up.add_to_sheet.connect_with_other_users",
      },
    ],
  },
  [SignUpModalKind.AddTranslation]: {
    h2: "model.sign_up.add_translation.have_your_own_translation_of_this_text",
    h3: "model.sign_up.add_translation.create_free_account__to_add_it_to_library",
    contentList: [
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.build_and_share_source_sheet",
      },
      {
        icon: "star-white.png",
        bulletContent: "text.save_text",
      },
      {
        icon: "note-white.svg",
        bulletContent: "note.take_note",
      },
      {
        icon: "share-icon-white.svg",
        bulletContent: "model.sign_up.add_to_sheet.connect_with_other_users",
      },
    ],
  },
  [SignUpModalKind.Follow]: {
    h2: "model.sign_up.follow.want_to_connect_with_other_users",
    h3: "model.sign_up.add_to_sheet.create_free_accout_to_join_conversation",
    contentList: [
      {
        icon: "profile-white.svg",
        bulletContent: "model.sign_up.follow.follow_your_favorite_creaters",
      },
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.build_and_share_source_sheet",
      },
      {
        icon: "note-white.svg",
        bulletContent: "model.sign_up.follow.send_messages",
      },
    ],
  },
  [SignUpModalKind.Notes]: {
    h2: "model.sign_up.note.dont_lose_that_thought",
    h3: "model.sign_up.add_connection.create_free_account",
    contentList: [
      {
        icon: "note-white.svg",
        bulletContent: "model.sign_up.note.take_notes_on_this_text",
      },
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.build_and_share_source_sheet",
      },
      {
        icon: "share-icon-white.svg",
        bulletContent: "model.sign_up.add_to_sheet.connect_with_other_users",
      },
      {
        icon: "email-white.png",
        bulletContent: "model.sign_up.note.get_updates_on_new_features",
      },
    ],
  },
  [SignUpModalKind.Save]: {
    h2: "model.sign_up.save.want_to_return_to_this_text",
    h3: "model.sign_up.add_connection.create_free_account",
    contentList: [
      {
        icon: "star-white.png",
        bulletContent: "text.save_text",
      },
      {
        icon: "note-white.svg",
        bulletContent: "note.take_note",
      },
      {
        icon: "clock-white.svg",
        bulletContent: "model.sign_up.save.view_your_reading_history",
      },
      {
        icon: "sheetsplus-white.svg",
        bulletContent: "model.sign_up.add_connection.content_list.build_and_share_source_sheet",
      },
    ],
  },
  [SignUpModalKind.Default]: {
    h2: "modal.sign_up.default.love_learning",
    h3: "modal.sign_up.default.sign_up__to_get_more_from_sefaria",
    contentList: [
      {
        icon: "star-white.png",
        bulletContent: "text.save_text",
      },
      {
        icon: "sheet-white.png",
        bulletContent: "sheet.make_source_sheet",
      },
      {
        icon: "note-white.png",
        bulletContent: "note.take_note",
      },
      {
        icon: "email-white.png",
        bulletContent: "modal.sign_up.stay_in_the_know",
      },
    ],
  },
};

export function generateContentForModal(signUpModalKind) {
  if (signUpModalContent.hasOwnProperty(signUpModalKind)) {
    return signUpModalContent[signUpModalKind];
  } else {
    return signUpModalContent[SignUpModalKind.Default];
  }
}