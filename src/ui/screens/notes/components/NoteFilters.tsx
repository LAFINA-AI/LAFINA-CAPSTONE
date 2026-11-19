import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {FilterType} from '../types';
import {SkillFonts} from '../../../theme/skills';

interface NoteFiltersProps {
  selectedFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  customCategories: string[];
}

export const NoteFilters: React.FC<NoteFiltersProps> = ({
  selectedFilter,
  onFilterChange,
  customCategories,
}) => {
  const {colors, isModern, modernPalette} = useTheme();

  const categories = [
    'Personal',
    'Work',
    'Health',
    'Learning',
    ...customCategories,
  ];
  const allFilters: FilterType[] = [
    'All',
    'AI Transcribed',
    'Pinned',
    ...categories,
  ];

  return (
    <View style={styles.filterContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroller}
      >
        {allFilters.map(filter => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              {
                backgroundColor: isModern
                  ? modernPalette.surface
                  : colors.inputBg,
                borderWidth: isModern ? 1 : 0,
                borderColor: modernPalette.border,
              },
              selectedFilter === filter && {
                backgroundColor: isModern
                  ? modernPalette.darkInkBtn
                  : colors.red,
                borderColor: isModern ? modernPalette.darkInkBtn : colors.red,
              },
            ]}
            onPress={() => onFilterChange(filter)}
            accessibilityRole="radio"
            accessibilityState={{checked: selectedFilter === filter}}
            accessibilityLabel={`${filter} notes`}
          >
            <Text
              style={[
                styles.filterChipText,
                {color: colors.textSecondary},
                selectedFilter === filter && {
                  color: colors.white,
                  fontWeight: 'bold',
                },
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  filterContainer: {marginBottom: 12},
  filterScroller: {paddingRight: 16},
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 22,
    marginRight: 8,
  },
  filterChipText: {fontFamily: SkillFonts.body, fontSize: 13},
});
