import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable,
    TreeView,
    commands
} from "vscode";
import * as path from "path";
import { MusicStoreManager } from "./MusicStoreManager";
import {
    PlaylistItem,
    PlayerName,
    PlayerType,
    TrackStatus,
    getSpotifyDevices,
    PlayerDevice,
    launchPlayer,
    playItunesTrackNumberInPlaylist
} from "cody-music";
import { SpotifyUser } from "cody-music/dist/lib/profile";
import { MusicControlManager } from "./MusicControlManager";

/**
 * Create the playlist tree item (root or leaf)
 * @param p
 * @param cstate
 */
const createMusicTimePlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new MusicTimePlaylistTreeItem(p, cstate);
};

/**
 * Launch the Spotify player if it's not already launched, then play the track
 * @param track
 * @param spotifyUser
 */
export const launchAndPlayTrack = async (
    track: PlaylistItem,
    spotifyUser: SpotifyUser
) => {
    const musicCtrlMgr = new MusicControlManager();
    const currentPlaylist: PlaylistItem = MusicStoreManager.getInstance()
        .selectedPlaylist;
    // check if there's any spotify devices
    const spotifyDevices: PlayerDevice[] = await getSpotifyDevices();
    if (!spotifyDevices || spotifyDevices.length === 0) {
        // no spotify devices found, lets launch the web player with the track

        // launch it
        await launchPlayer(PlayerName.SpotifyWeb);
        // now select it from within the playlist
        setTimeout(() => {
            musicCtrlMgr.playSpotifyTrackFromPlaylist(
                spotifyUser,
                currentPlaylist.id,
                track,
                spotifyDevices,
                10 /* checkTrackStateAndTryAgain */
            );
        }, 2000);
    } else {
        // a device is found, play using the device
        await musicCtrlMgr.playSpotifyTrackFromPlaylist(
            spotifyUser,
            currentPlaylist.id,
            track,
            spotifyDevices
        );
    }
};

export const connectMusicTimePlaylistTreeView = (
    view: TreeView<PlaylistItem>
) => {
    return Disposable.from(
        view.onDidChangeSelection(async e => {
            if (!e.selection || e.selection.length === 0) {
                return;
            }
            let playlistItem: PlaylistItem = e.selection[0];

            if (playlistItem.command) {
                // run the command
                commands.executeCommand(playlistItem.command);
                return;
            }

            const musicCtrlMgr = new MusicControlManager();
            const musicstoreMgr = MusicStoreManager.getInstance();

            //
            // MusicStateManager gatherMusicInfo will be called
            // after pause or play has been invoked. That will also
            // update the button states
            //

            if (playlistItem.type === "track") {
                musicstoreMgr.selectedTrackItem = playlistItem;

                const notPlaying =
                    playlistItem.state !== TrackStatus.Playing ? true : false;

                if (playlistItem.playerType === PlayerType.MacItunesDesktop) {
                    if (notPlaying) {
                        // await playItunesTrackFromPlaylist(playlistItem);
                        const pos: number = playlistItem.position || 1;
                        await playItunesTrackNumberInPlaylist(
                            musicstoreMgr.selectedPlaylist.name,
                            pos
                        );
                    } else {
                        musicCtrlMgr.pause(PlayerName.ItunesDesktop);
                    }
                } else {
                    if (notPlaying) {
                        await launchAndPlayTrack(
                            playlistItem,
                            musicstoreMgr.spotifyUser
                        );
                    } else {
                        musicCtrlMgr.pause(PlayerName.SpotifyWeb);
                    }
                }
            } else {
                musicstoreMgr.selectedPlaylist = playlistItem;
            }
        }),
        view.onDidChangeVisibility(e => {
            /**
            if (e.visible) {
                //
            }
            **/
        })
    );
};

export class MusicTimePlaylistProvider
    implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();

    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    private view: TreeView<PlaylistItem>;

    constructor() {
        //
    }

    bindView(view: TreeView<PlaylistItem>): void {
        this.view = view;
    }

    getParent(_p: PlaylistItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    refreshParent(parent: PlaylistItem) {
        this._onDidChangeTreeData.fire(parent);
    }

    getTreeItem(p: PlaylistItem): MusicTimePlaylistTreeItem {
        let treeItem: MusicTimePlaylistTreeItem = null;
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
                return createMusicTimePlaylistTreeItem(
                    p,
                    TreeItemCollapsibleState.Collapsed
                );
            }
            treeItem = createMusicTimePlaylistTreeItem(
                p,
                TreeItemCollapsibleState.None
            );
        } else {
            // it's a track or a title
            treeItem = createMusicTimePlaylistTreeItem(
                p,
                TreeItemCollapsibleState.None
            );

            // reveal the track state if it's playing or paused
            if (
                p.state === TrackStatus.Playing ||
                p.state === TrackStatus.Paused
            ) {
                // don't "select" it thought. that will invoke the pause/play action
                this.view.reveal(p, {
                    focus: true,
                    select: false
                });
            }
        }

        return treeItem;
    }

    async getChildren(element?: PlaylistItem): Promise<PlaylistItem[]> {
        if (element) {
            /** example...
                collaborative:false
                id:"MostRecents"
                name:"MostRecents"
                public:true
                tracks:PlaylistTrackInfo {href: "", total: 34}
                type:"playlist"
                playerType:"MacItunesDesktop"
             */

            // return track of the playlist parent
            let tracks = await MusicStoreManager.getInstance().getTracksForPlaylistId(
                element.id
            );

            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = MusicStoreManager.getInstance().musicTimePlaylists;
            return playlists;
        }
    }
}

/**
 * The TreeItem contains the "contextValue", which is represented as the "viewItem"
 * from within the package.json when determining if there should be decoracted context
 * based on that value.
 */
export class MusicTimePlaylistTreeItem extends TreeItem {
    private resourcePath: string = path.join(
        __filename,
        "..",
        "..",
        "..",
        "resources"
    );

    constructor(
        private readonly treeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(treeItem.name, collapsibleState);

        // set the track's context value to the playlist item state
        // if it's a track that's playing or paused it will show the appropriate button.
        // if it's a playlist folder that has a track that is playing or paused it will show the appropriate button
        this.contextValue = `${treeItem.type}-item-${treeItem.state}`;

        if (treeItem.type === "playlist") {
            if (treeItem.tag === "paw") {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "light",
                    "pl-paw.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "dark",
                    "pl-paw.svg"
                );
            } else if (treeItem.tag === "action") {
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "light",
                    "settings.svg"
                );
                this.iconPath.light = path.join(
                    this.resourcePath,
                    "dark",
                    "settings.svg"
                );
            } else {
                // for now, don't show the playlist icon
                delete this.iconPath;
            }
        } else {
            delete this.iconPath;
        }
    }

    get tooltip(): string {
        return `${this.treeItem.tooltip}`;
    }

    iconPath = {
        light: "",
        dark: ""
    };

    contextValue = "playlistItem";
}