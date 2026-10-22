import { forwardRef, type SVGProps } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import AppleIcon from '@hugeicons/core-free-icons/AppleIcon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowExpand01Icon from '@hugeicons/core-free-icons/ArrowExpand01Icon';
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowLeftRightIcon from '@hugeicons/core-free-icons/ArrowLeftRightIcon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import ArrowShrink01Icon from '@hugeicons/core-free-icons/ArrowShrink01Icon';
import ArrowUp01Icon from '@hugeicons/core-free-icons/ArrowUp01Icon';
import BookOpen01Icon from '@hugeicons/core-free-icons/BookOpen01Icon';
import Bookmark01Icon from '@hugeicons/core-free-icons/Bookmark01Icon';
import BrainIcon from '@hugeicons/core-free-icons/BrainIcon';
import Building03Icon from '@hugeicons/core-free-icons/Building03Icon';
import BubbleChatIcon from '@hugeicons/core-free-icons/BubbleChatIcon';
import Calendar01Icon from '@hugeicons/core-free-icons/Calendar01Icon';
import Camera01Icon from '@hugeicons/core-free-icons/Camera01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import CheckIcon from '@hugeicons/core-free-icons/CheckIcon';
import CircleIcon from '@hugeicons/core-free-icons/CircleIcon';
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';
import ColorPickerIcon from '@hugeicons/core-free-icons/ColorPickerIcon';
import CompassIcon from '@hugeicons/core-free-icons/CompassIcon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import Cursor01Icon from '@hugeicons/core-free-icons/Cursor01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Doc01Icon from '@hugeicons/core-free-icons/Doc01Icon';
import Download01Icon from '@hugeicons/core-free-icons/Download01Icon';
import EraserIcon from '@hugeicons/core-free-icons/EraserIcon';
import EyeClosedIcon from '@hugeicons/core-free-icons/EyeClosedIcon';
import EyeIcon from '@hugeicons/core-free-icons/EyeIcon';
import FeatherIcon from '@hugeicons/core-free-icons/FeatherIcon';
import FileArchiveIcon from '@hugeicons/core-free-icons/FileArchiveIcon';
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon';
import FileSearchIcon from '@hugeicons/core-free-icons/FileSearchIcon';
import FileTextIcon from '@hugeicons/core-free-icons/FileTextIcon';
import FlashIcon from '@hugeicons/core-free-icons/FlashIcon';
import FlimSlateIcon from '@hugeicons/core-free-icons/FlimSlateIcon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import Folder02Icon from '@hugeicons/core-free-icons/Folder02Icon';
import FoldersIcon from '@hugeicons/core-free-icons/FoldersIcon';
import GlobeIcon from '@hugeicons/core-free-icons/GlobeIcon';
import GoogleIcon from '@hugeicons/core-free-icons/GoogleIcon';
import Grid2X2Icon from '@hugeicons/core-free-icons/Grid2X2Icon';
import GripVerticalIcon from '@hugeicons/core-free-icons/GripVerticalIcon';
import HandIcon from '@hugeicons/core-free-icons/HandIcon';
import HashIcon from '@hugeicons/core-free-icons/HashIcon';
import Heading01Icon from '@hugeicons/core-free-icons/Heading01Icon';
import Heading02Icon from '@hugeicons/core-free-icons/Heading02Icon';
import HeartIcon from '@hugeicons/core-free-icons/HeartIcon';
import HistoryIcon from '@hugeicons/core-free-icons/HistoryIcon';
import Image01Icon from '@hugeicons/core-free-icons/Image01Icon';
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon';
import Key01Icon from '@hugeicons/core-free-icons/Key01Icon';
import LightbulbIcon from '@hugeicons/core-free-icons/LightbulbIcon';
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import SolidLine01Icon from '@hugeicons/core-free-icons/SolidLine01Icon';
import ListIcon from '@hugeicons/core-free-icons/ListIcon';
import ListOrderedIcon from '@hugeicons/core-free-icons/ListOrderedIcon';
import ListViewIcon from '@hugeicons/core-free-icons/ListViewIcon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import SquareLock01Icon from '@hugeicons/core-free-icons/SquareLock01Icon';
import Logout01Icon from '@hugeicons/core-free-icons/Logout01Icon';
import MagicWand01Icon from '@hugeicons/core-free-icons/MagicWand01Icon';
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import MapIcon from '@hugeicons/core-free-icons/MapIcon';
import MapPinIcon from '@hugeicons/core-free-icons/MapPinIcon';
import Maximize01Icon from '@hugeicons/core-free-icons/Maximize01Icon';
import MinusIcon from '@hugeicons/core-free-icons/MinusIcon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';
import MoreVerticalIcon from '@hugeicons/core-free-icons/MoreVerticalIcon';
import MusicNote01Icon from '@hugeicons/core-free-icons/MusicNote01Icon';
import Note01Icon from '@hugeicons/core-free-icons/Note01Icon';
import NoteEditIcon from '@hugeicons/core-free-icons/NoteEditIcon';
import NotebookIcon from '@hugeicons/core-free-icons/NotebookIcon';
import PackageIcon from '@hugeicons/core-free-icons/PackageIcon';
import PaintBoardIcon from '@hugeicons/core-free-icons/PaintBoardIcon';
import PaintBucketIcon from '@hugeicons/core-free-icons/PaintBucketIcon';
import PaletteIcon from '@hugeicons/core-free-icons/PaletteIcon';
import Pdf01Icon from '@hugeicons/core-free-icons/Pdf01Icon';
import PencilIcon from '@hugeicons/core-free-icons/PencilIcon';
import PenTool01Icon from '@hugeicons/core-free-icons/PenTool01Icon';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import QuestionIcon from '@hugeicons/core-free-icons/QuestionIcon';
import Redo02Icon from '@hugeicons/core-free-icons/Redo02Icon';
import Refresh01Icon from '@hugeicons/core-free-icons/Refresh01Icon';
import RotateCcwIcon from '@hugeicons/core-free-icons/RotateCcwIcon';
import RotateClockwiseIcon from '@hugeicons/core-free-icons/RotateClockwiseIcon';
import ScissorsIcon from '@hugeicons/core-free-icons/ScissorsIcon';
import ScrollIcon from '@hugeicons/core-free-icons/ScrollIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import SearchAddIcon from '@hugeicons/core-free-icons/SearchAddIcon';
import SearchMinusIcon from '@hugeicons/core-free-icons/SearchMinusIcon';
import SendHorizontalIcon from '@hugeicons/core-free-icons/SendHorizontalIcon';
import SendIcon from '@hugeicons/core-free-icons/SendIcon';
import ShieldCheckIcon from '@hugeicons/core-free-icons/ShieldCheckIcon';
import ShoppingBag01Icon from '@hugeicons/core-free-icons/ShoppingBag01Icon';
import SidebarLeft01Icon from '@hugeicons/core-free-icons/SidebarLeft01Icon';
import SidebarRight01Icon from '@hugeicons/core-free-icons/SidebarRight01Icon';
import PanelLeftOpenIcon from '@hugeicons/core-free-icons/PanelLeftOpenIcon';
import PanelLeftCloseIcon from '@hugeicons/core-free-icons/PanelLeftCloseIcon';
import PanelRightOpenIcon from '@hugeicons/core-free-icons/PanelRightOpenIcon';
import PanelRightCloseIcon from '@hugeicons/core-free-icons/PanelRightCloseIcon';
import SnowflakeIcon from '@hugeicons/core-free-icons/SnowflakeIcon';
import SparkleIcon from '@hugeicons/core-free-icons/SparkleIcon';
import SquareIcon from '@hugeicons/core-free-icons/SquareIcon';
import Tag01Icon from '@hugeicons/core-free-icons/Tag01Icon';
import TextBoldIcon from '@hugeicons/core-free-icons/TextBoldIcon';
import TextIndentIcon from '@hugeicons/core-free-icons/TextIndentIcon';
import TextItalicIcon from '@hugeicons/core-free-icons/TextItalicIcon';
import TextUnderlineIcon from '@hugeicons/core-free-icons/TextUnderlineIcon';
import TranslateIcon from '@hugeicons/core-free-icons/TranslateIcon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import Upload01Icon from '@hugeicons/core-free-icons/Upload01Icon';
import UserCircleIcon from '@hugeicons/core-free-icons/UserCircleIcon';
import UserIcon from '@hugeicons/core-free-icons/UserIcon';
import VolumeHighIcon from '@hugeicons/core-free-icons/VolumeHighIcon';
import VolumeOffIcon from '@hugeicons/core-free-icons/VolumeOffIcon';
import WindIcon from '@hugeicons/core-free-icons/WindIcon';

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'strokeWidth'> {
  size?: string | number;
  strokeWidth?: number;
  weight?: IconWeight;
}

const strokeWidths: Record<IconWeight, number> = {
  thin: 1.25,
  light: 1.4,
  regular: 1.6,
  duotone: 1.6,
  bold: 2,
  fill: 2,
};

/**
 * Adapts the free Hugeicons stroke set to the small Phosphor-shaped API used by
 * the app. This keeps icon sizing and emphasis consistent while the call sites
 * remain semantic and easy to change as a group.
 */
function createIcon(icon: IconSvgElement, displayName: string, fillOnFillWeight = false) {
  const Component = forwardRef<SVGSVGElement, IconProps>(function StoryModeIcon(
    {
      size = 24,
      weight = 'regular',
      strokeWidth,
      className,
      fill,
      ...props
    },
    ref,
  ) {
    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        size={size}
        strokeWidth={strokeWidth ?? strokeWidths[weight]}
        fill={fill ?? (weight === 'fill' && fillOnFillWeight ? 'currentColor' : 'none')}
        className={[
          '[&_*]:[stroke-linecap:square]',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      />
    );
  });

  Component.displayName = displayName;
  return Component;
}

export const AppleLogo = createIcon(AppleIcon, 'AppleLogo', true);
export const ArrowClockwise = createIcon(RotateClockwiseIcon, 'ArrowClockwise');
export const ArrowCounterClockwise = createIcon(RotateCcwIcon, 'ArrowCounterClockwise');
export const ArrowDown = createIcon(ArrowDown01Icon, 'ArrowDown');
export const ArrowLeft = createIcon(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowRight = createIcon(ArrowRight01Icon, 'ArrowRight');
export const ArrowUUpLeft = createIcon(Undo02Icon, 'ArrowUUpLeft');
export const ArrowUUpRight = createIcon(Redo02Icon, 'ArrowUUpRight');
export const ArrowsClockwise = createIcon(Refresh01Icon, 'ArrowsClockwise');
export const ArrowsIn = createIcon(ArrowShrink01Icon, 'ArrowsIn');
export const ArrowsLeftRight = createIcon(ArrowLeftRightIcon, 'ArrowsLeftRight');
export const ArrowsOut = createIcon(ArrowExpand01Icon, 'ArrowsOut');
export const BookOpen = createIcon(BookOpen01Icon, 'BookOpen');
export const BookmarkSimple = createIcon(Bookmark01Icon, 'BookmarkSimple', true);
export const Brain = createIcon(BrainIcon, 'Brain');
export const Buildings = createIcon(Building03Icon, 'Buildings');
export const CalendarBlank = createIcon(Calendar01Icon, 'CalendarBlank');
export const Camera = createIcon(Camera01Icon, 'Camera');
export const CaretDown = createIcon(ArrowDown01Icon, 'CaretDown');
export const CaretLeft = createIcon(ArrowLeft01Icon, 'CaretLeft');
export const CaretRight = createIcon(ArrowRight01Icon, 'CaretRight');
export const CaretUp = createIcon(ArrowUp01Icon, 'CaretUp');
export const ChatCircleDots = createIcon(BubbleChatIcon, 'ChatCircleDots');
export const Check = createIcon(CheckIcon, 'Check');
export const Circle = createIcon(CircleIcon, 'Circle', true);
export const ClockClockwise = createIcon(Clock01Icon, 'ClockClockwise');
export const ClockCounterClockwise = createIcon(HistoryIcon, 'ClockCounterClockwise');
export const Coins = createIcon(Coins01Icon, 'Coins');
export const Compass = createIcon(CompassIcon, 'Compass');
export const Copy = createIcon(Copy01Icon, 'Copy');
export const CornersOut = createIcon(Maximize01Icon, 'CornersOut');
export const CreditCard = createIcon(CreditCardIcon, 'CreditCard');
export const Cursor = createIcon(Cursor01Icon, 'Cursor');
export const DotsSixVertical = createIcon(GripVerticalIcon, 'DotsSixVertical');
export const DotsThree = createIcon(MoreHorizontalIcon, 'DotsThree');
export const DotsThreeVertical = createIcon(MoreVerticalIcon, 'DotsThreeVertical');
export const DownloadSimple = createIcon(Download01Icon, 'DownloadSimple');
export const Envelope = createIcon(Mail01Icon, 'Envelope');
export const Eraser = createIcon(EraserIcon, 'Eraser');
export const Eye = createIcon(EyeIcon, 'Eye');
export const EyeClosed = createIcon(EyeClosedIcon, 'EyeClosed');
export const Eyedropper = createIcon(ColorPickerIcon, 'Eyedropper');
export const Feather = createIcon(FeatherIcon, 'Feather');
export const FileArchive = createIcon(FileArchiveIcon, 'FileArchive');
export const FileDoc = createIcon(Doc01Icon, 'FileDoc');
export const FileMagnifyingGlass = createIcon(FileSearchIcon, 'FileMagnifyingGlass');
export const FileMd = createIcon(FileCodeIcon, 'FileMd');
export const FilePdf = createIcon(Pdf01Icon, 'FilePdf');
export const FileText = createIcon(FileTextIcon, 'FileText');
export const FilmSlate = createIcon(FlimSlateIcon, 'FilmSlate');
export const Folder = createIcon(Folder01Icon, 'Folder');
export const FolderSimple = createIcon(Folder02Icon, 'FolderSimple');
export const Folders = createIcon(FoldersIcon, 'Folders');
export const Gear = createIcon(Settings02Icon, 'Gear');
export const Globe = createIcon(GlobeIcon, 'Globe');
export const GoogleLogo = createIcon(GoogleIcon, 'GoogleLogo');
export const Hand = createIcon(HandIcon, 'Hand');
export const Hash = createIcon(HashIcon, 'Hash');
export const Heart = createIcon(HeartIcon, 'Heart');
export const ImageSquare = createIcon(Image01Icon, 'ImageSquare');
export const Info = createIcon(InformationCircleIcon, 'Info');
export const Key = createIcon(Key01Icon, 'Key');
export const Lightbulb = createIcon(LightbulbIcon, 'Lightbulb');
export const Lightning = createIcon(FlashIcon, 'Lightning');
export const Link = createIcon(Link01Icon, 'Link');
export const LineSegment = createIcon(SolidLine01Icon, 'LineSegment');
export const List = createIcon(ListIcon, 'List');
export const ListBullets = createIcon(ListViewIcon, 'ListBullets');
export const ListNumbers = createIcon(ListOrderedIcon, 'ListNumbers');
export const Lock = createIcon(SquareLock01Icon, 'Lock');
export const MagicWand = createIcon(MagicWand01Icon, 'MagicWand');
export const MagnifyingGlass = createIcon(Search01Icon, 'MagnifyingGlass');
export const MagnifyingGlassMinus = createIcon(SearchMinusIcon, 'MagnifyingGlassMinus');
export const MagnifyingGlassPlus = createIcon(SearchAddIcon, 'MagnifyingGlassPlus');
export const MapPin = createIcon(MapPinIcon, 'MapPin');
export const MapTrifold = createIcon(MapIcon, 'MapTrifold');
export const Minus = createIcon(MinusIcon, 'Minus');
export const MusicNotes = createIcon(MusicNote01Icon, 'MusicNotes');
export const Note = createIcon(Note01Icon, 'Note');
export const NotePencil = createIcon(NoteEditIcon, 'NotePencil');
export const Notebook = createIcon(NotebookIcon, 'Notebook');
export const Package = createIcon(PackageIcon, 'Package');
export const PaintBucket = createIcon(PaintBucketIcon, 'PaintBucket');
export const Palette = createIcon(PaletteIcon, 'Palette');
export const PaperPlaneRight = createIcon(SendHorizontalIcon, 'PaperPlaneRight');
export const PaperPlaneTilt = createIcon(SendIcon, 'PaperPlaneTilt');
export const PenNib = createIcon(PenTool01Icon, 'PenNib');
export const PencilSimple = createIcon(PencilIcon, 'PencilSimple');
export const Play = createIcon(PlayIcon, 'Play', true);
export const Plus = createIcon(Add01Icon, 'Plus');
export const Question = createIcon(QuestionIcon, 'Question');
export const Scissors = createIcon(ScissorsIcon, 'Scissors');
export const Scroll = createIcon(ScrollIcon, 'Scroll');
export const ShieldCheck = createIcon(ShieldCheckIcon, 'ShieldCheck');
export const ShoppingBag = createIcon(ShoppingBag01Icon, 'ShoppingBag');
export const Sidebar = createIcon(SidebarRight01Icon, 'Sidebar');
export const SidebarSimple = createIcon(SidebarLeft01Icon, 'SidebarSimple');
/**
 * Side panel toggles: the panel on its side, with an arrow the way it moves.
 * Opening points into the page, closing toward the edge. Hugeicons' left pair
 * is named the other way round (its "close" arrow points in), so it's swapped here.
 */
export const PanelLeftOpen = createIcon(PanelLeftCloseIcon, 'PanelLeftOpen');
export const PanelLeftClose = createIcon(PanelLeftOpenIcon, 'PanelLeftClose');
export const PanelRightOpen = createIcon(PanelRightOpenIcon, 'PanelRightOpen');
export const PanelRightClose = createIcon(PanelRightCloseIcon, 'PanelRightClose');
export const SignOut = createIcon(Logout01Icon, 'SignOut');
export const Snowflake = createIcon(SnowflakeIcon, 'Snowflake');
export const Sparkle = createIcon(SparkleIcon, 'Sparkle', true);
export const SpeakerSimpleHigh = createIcon(VolumeHighIcon, 'SpeakerSimpleHigh');
export const SpeakerSimpleSlash = createIcon(VolumeOffIcon, 'SpeakerSimpleSlash');
export const SpinnerGap = createIcon(Loading03Icon, 'SpinnerGap');
export const Square = createIcon(SquareIcon, 'Square', true);
export const SquaresFour = createIcon(Grid2X2Icon, 'SquaresFour');
export const Tag = createIcon(Tag01Icon, 'Tag');
export const TextB = createIcon(TextBoldIcon, 'TextB');
export const TextHOne = createIcon(Heading01Icon, 'TextHOne');
export const TextHTwo = createIcon(Heading02Icon, 'TextHTwo');
export const TextIndent = createIcon(TextIndentIcon, 'TextIndent');
export const TextItalic = createIcon(TextItalicIcon, 'TextItalic');
export const TextUnderline = createIcon(TextUnderlineIcon, 'TextUnderline');
export const Translate = createIcon(TranslateIcon, 'Translate');
export const Trash = createIcon(Delete02Icon, 'Trash');
export const Upload = createIcon(Upload01Icon, 'Upload');
export const User = createIcon(UserIcon, 'User');
export const UserCircle = createIcon(UserCircleIcon, 'UserCircle');
export const Warning = createIcon(Alert02Icon, 'Warning');
export const Wind = createIcon(WindIcon, 'Wind');
export const X = createIcon(Cancel01Icon, 'X');
export const XCircle = createIcon(CancelCircleIcon, 'XCircle');

// Notebook-header actions that had already been trialled with Hugeicons.
export const ScanDocument = createIcon(FileSearchIcon, 'ScanDocument');
export const Theme = createIcon(PaintBoardIcon, 'Theme');
