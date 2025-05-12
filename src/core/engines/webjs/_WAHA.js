exports.LoadWAHA = () => {
  window.WAHA = {};
  window.WAHA.WAWebBizLabelEditingAction = window.require(
    'WAWebBizLabelEditingAction',
  );

  window.WAHA.getChats = async (pagination) => {
    let chats = window.Store.Chat.getModelsArray().slice();
    const paginator = new window.Paginator(pagination);
    chats = paginator.apply(chats);
    const chatPromises = chats.map((chat) => window.WWebJS.getChatModel(chat));
    return await Promise.all(chatPromises);
  };

  // Set push name
  window.WAHA.WAWebSetPushnameConnAction = window.require(
    'WAWebSetPushnameConnAction',
  );

  // Get my status
  window.WAHA.WAWebTextStatusCollection = window.require(
    'WAWebTextStatusCollection',
  );
};
