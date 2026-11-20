import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { setAudioPlayer } from "./client/audio";
import { CarModeScreen } from "./client/screen";

function CarModeItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Car"
      active={currentScreen?.screenId === "main"}
      onPress={() => openScreen({ screenId: "main" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  setAudioPlayer((source) => client.playAudio(source));
  client.addScreen({ id: "main", title: "Car mode", Component: CarModeScreen });
  client.addSidebarHeaderItem({ id: "main", title: "Car mode", Component: CarModeItem });
  client.addCommandCenterItem({
    id: "open",
    title: "Open car mode",
    icon: "Car",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "main" });
    },
  });
  return () => setAudioPlayer(null);
}
