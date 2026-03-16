import type { FunctionalComponent } from 'vue'

const features = ['Vite', 'TypeScript', 'ESLint', 'Less', 'Prettier', 'TSX']

const TsxFeature: FunctionalComponent = () => {
  return (
    <div class="tsx-feature">
      <span class="tsx-feature__label">TSX Ready</span>
      <div class="tsx-feature__list">
        {features.map((item) => (
          <span key={item} class="tsx-feature__item">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

TsxFeature.displayName = 'TsxFeature'

export default TsxFeature
